import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type {
  SendTransactionalEmailInput,
  TransactionalEmailService,
} from "../../src/bookings/email/email-service.js";
import { createBookingEmailHandler } from "../../src/bookings/email/handler.js";
import type { ValidatedBookingReminderDueEvent } from "../../src/bookings/event-schema.js";
import { startWorkerTestInfrastructure } from "../helpers/test-infrastructure.js";

class FakeEmailService implements TransactionalEmailService {
  sent: SendTransactionalEmailInput[] = [];

  async send(input: SendTransactionalEmailInput) {
    this.sent.push(input);
    return { id: `fake-${this.sent.length}` };
  }
}

const infra = await startWorkerTestInfrastructure();
beforeEach(() => infra.reset());
afterAll(() => infra.stop());

const encryptionKey = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
const encryptedToken =
  "v1.MTIzNDU2Nzg5MDEy.EsNME9uHVP4D5L7hWNKvnyR0v1e0pO6wZoCukCc5Cb0wuK8nNUJa4AgE4Q.9bez_B22t0eCpU8sWX40LQ";
const rawToken = "0123456789012345678901234567890123456789012";
const handlerNow = new Date("2026-06-14T10:00:30.000Z");

async function fixture() {
  const organizationId = randomUUID();
  const serviceId = randomUUID();
  const resourceId = randomUUID();
  const bookingId = randomUUID();
  const reminderId = randomUUID();
  const startAt = new Date("2026-06-15T10:00:00.000Z");
  await infra.pool.query(
    `INSERT INTO organization (id, name, slug)
     VALUES ($1, '<script>alert(1)</script>', $2)`,
    [organizationId, `org-${organizationId}`],
  );
  await infra.pool.query(
    `INSERT INTO service (
       id, organization_id, name, slug, duration_minutes, price_agorot
     ) VALUES ($1, $2, 'Service < > & " test', $3, 99, 99999)`,
    [serviceId, organizationId, `service-${serviceId}`],
  );
  await infra.pool.query(
    `INSERT INTO resource (id, organization_id, name)
     VALUES ($1, $2, 'Resource '' & <test>')`,
    [resourceId, organizationId],
  );
  await infra.pool.query(
    `INSERT INTO booking (
       id, organization_id, service_id, resource_id, public_reference,
       status, start_at, end_at, duration_minutes, price_agorot,
       guest_name, guest_email, guest_phone,
       guest_management_token_hash, guest_management_token_encrypted
     ) VALUES (
       $1, $2, $3, $4, 'BK-REMINDER', 'confirmed', $5, $6, 45, 12345,
       'Guest < & " name', 'current@example.test', NULL, 'token-hash', $7
     )`,
    [
      bookingId,
      organizationId,
      serviceId,
      resourceId,
      startAt,
      new Date(startAt.getTime() + 45 * 60_000),
      encryptedToken,
    ],
  );
  await infra.pool.query(
    `INSERT INTO booking_reminder (
       id, booking_id, scheduled_for_start_at, due_at, status, dispatched_at
     ) VALUES ($1, $2, $3, $4, 'dispatched', $5)`,
    [
      reminderId,
      bookingId,
      startAt,
      new Date(startAt.getTime() - 24 * 60 * 60_000),
      handlerNow,
    ],
  );
  const event: ValidatedBookingReminderDueEvent = {
    eventId: randomUUID(),
    aggregateType: "booking",
    aggregateId: bookingId,
    eventType: "booking.reminder_due",
    occurredAt: handlerNow.toISOString(),
    payload: {
      reminderId,
      bookingId,
      scheduledForStartAt: startAt.toISOString(),
    },
  };
  return { organizationId, bookingId, reminderId, event, startAt };
}

function createHandler(emailService: FakeEmailService) {
  return createBookingEmailHandler({
    pool: infra.pool,
    emailService,
    encryptionKey,
    guestBookingManagementUrl: "http://localhost:5173/booking/manage",
    now: () => handlerNow,
  });
}

describe("Booking reminder email handler", () => {
  it("uses current Booking context, snapshots, secure link, and stable reminder idempotency", async () => {
    const f = await fixture();
    const emailService = new FakeEmailService();
    await createHandler(emailService)(f.event);

    expect(emailService.sent).toHaveLength(1);
    const sent = emailService.sent[0];
    expect(sent).toBeDefined();
    if (!sent) throw new Error("Expected reminder email");
    expect(sent.to).toBe("current@example.test");
    expect(sent.subject).toBe(
      "Appointment reminder — <script>alert(1)</script>",
    );
    expect(sent.idempotencyKey).toBe(`booking-reminder/${f.reminderId}`);
    expect(sent.text).toContain("Your appointment is tomorrow.");
    expect(sent.text).toContain('Service < > & " test');
    expect(sent.text).toContain("Resource ' & <test>");
    expect(sent.text).toContain("Duration: 45 min");
    expect(sent.text).toContain("Price:");
    expect(sent.text).toContain(rawToken);
    expect(sent.html).toContain("Manage booking");
    expect(sent.html).not.toContain("<script>alert(1)</script>");
    expect(sent.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(sent.html).toContain("Service &lt; &gt; &amp; &quot; test");
    expect(
      (
        await infra.pool.query(
          "SELECT status, sent_at FROM booking_reminder WHERE id = $1",
          [f.reminderId],
        )
      ).rows[0],
    ).toEqual({ status: "sent", sent_at: handlerNow });
  });

  it("records a receipt and does not send twice on redelivery", async () => {
    const f = await fixture();
    const emailService = new FakeEmailService();
    const handler = createHandler(emailService);
    await handler(f.event);
    await handler(f.event);
    expect(emailService.sent).toHaveLength(1);
    expect(
      (
        await infra.pool.query(
          "SELECT outcome FROM consumer_receipt WHERE event_id = $1",
          [f.event.eventId],
        )
      ).rows,
    ).toEqual([{ outcome: "email_sent" }]);
  });

  it.each([
    ["cancelled", "skipped_cancelled"],
    ["rescheduled", "skipped_rescheduled"],
    ["no_email", "skipped_no_email"],
    ["suspended", "skipped_suspended"],
    ["archived", "skipped_archived"],
    ["start_passed", "skipped_start_passed"],
  ] as const)(
    "turns %s stale state into a completed skip",
    async (kind, outcome) => {
      const f = await fixture();
      if (kind === "cancelled")
        await infra.pool.query(
          "UPDATE booking SET status = 'cancelled' WHERE id = $1",
          [f.bookingId],
        );
      if (kind === "rescheduled")
        await infra.pool.query(
          "UPDATE booking SET start_at = $2 WHERE id = $1",
          [f.bookingId, new Date("2026-06-16T10:00:00.000Z")],
        );
      if (kind === "no_email")
        await infra.pool.query(
          "UPDATE booking SET guest_email = NULL WHERE id = $1",
          [f.bookingId],
        );
      if (kind === "suspended")
        await infra.pool.query(
          "UPDATE organization SET suspended_at = $2 WHERE id = $1",
          [f.organizationId, handlerNow],
        );
      if (kind === "archived")
        await infra.pool.query(
          "UPDATE organization SET archived_at = $2 WHERE id = $1",
          [f.organizationId, handlerNow],
        );
      if (kind === "start_passed") {
        await infra.pool.query(
          "UPDATE booking SET start_at = $2 WHERE id = $1",
          [f.bookingId, new Date("2026-06-14T09:00:00.000Z")],
        );
        await infra.pool.query(
          "UPDATE booking_reminder SET scheduled_for_start_at = $2 WHERE id = $1",
          [f.reminderId, new Date("2026-06-14T09:00:00.000Z")],
        );
        f.event.payload.scheduledForStartAt = "2026-06-14T09:00:00.000Z";
      }

      const emailService = new FakeEmailService();
      await createHandler(emailService)(f.event);
      expect(emailService.sent).toHaveLength(0);
      expect(
        (
          await infra.pool.query(
            "SELECT outcome FROM consumer_receipt WHERE event_id = $1",
            [f.event.eventId],
          )
        ).rows,
      ).toEqual([{ outcome }]);
      expect(
        (
          await infra.pool.query(
            "SELECT status FROM booking_reminder WHERE id = $1",
            [f.reminderId],
          )
        ).rows[0],
      ).toEqual({ status: "skipped" });
    },
  );

  it("skips a reminder already cancelled after dispatch", async () => {
    const f = await fixture();
    await infra.pool.query(
      `UPDATE booking_reminder
       SET status = 'cancelled', cancelled_at = $2, dispatched_at = NULL
       WHERE id = $1`,
      [f.reminderId, handlerNow],
    );
    const emailService = new FakeEmailService();
    await createHandler(emailService)(f.event);
    expect(emailService.sent).toHaveLength(0);
    expect(
      (
        await infra.pool.query(
          "SELECT outcome FROM consumer_receipt WHERE event_id = $1",
          [f.event.eventId],
        )
      ).rows,
    ).toEqual([{ outcome: "skipped_reminder_cancelled" }]);
  });
});
