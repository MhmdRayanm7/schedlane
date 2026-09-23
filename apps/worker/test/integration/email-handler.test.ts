import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PermanentEventError } from "../../src/bookings/consumer.js";
import type {
  SendTransactionalEmailInput,
  SendTransactionalEmailResult,
  TransactionalEmailService,
} from "../../src/bookings/email/email-service.js";
import { createBookingEmailHandler } from "../../src/bookings/email/handler.js";
import type { ValidatedBookingEvent } from "../../src/bookings/event-schema.js";
import { startWorkerTestInfrastructure } from "../helpers/test-infrastructure.js";

class FakeTransactionalEmailService implements TransactionalEmailService {
  public sent: SendTransactionalEmailInput[] = [];

  async send(
    input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult> {
    this.sent.push(input);
    return { id: `fake-${this.sent.length}` };
  }
}

const infra = await startWorkerTestInfrastructure();
beforeEach(() => infra.reset());
afterAll(() => infra.stop());

describe("Booking Email Handler Integration", () => {
  const encryptionKey = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="; // 32 bytes base64
  const managementBaseUrl = "http://localhost:5173/booking/manage";

  const encryptedTokenEnvelope =
    "v1.MTIzNDU2Nzg5MDEy.EsNME9uHVP4D5L7hWNKvnyR0v1e0pO6wZoCukCc5Cb0wuK8nNUJa4AgE4Q.9bez_B22t0eCpU8sWX40LQ";
  const rawToken = "0123456789012345678901234567890123456789012";

  async function createOrganization(pool: pg.Pool, id: string) {
    await pool.query(
      `INSERT INTO organization (id, name, slug, timezone)
       VALUES ($1, 'Org 1', $2, 'Asia/Jerusalem')`,
      [id, `org-${id}`],
    );
  }

  async function createService(pool: pg.Pool, id: string, orgId: string) {
    await pool.query(
      `INSERT INTO service (id, organization_id, name, slug, duration_minutes, price_agorot)
       VALUES ($1, $2, 'Service 1', $3, 30, 10000)`,
      [id, orgId, `service-${id}`],
    );
  }

  async function createBooking(
    pool: pg.Pool,
    id: string,
    orgId: string,
    serviceId: string,
    encryptedToken: string | null = null,
  ) {
    await pool.query(
      `INSERT INTO booking (
        id, organization_id, service_id, public_reference,
        status, start_at, end_at, guest_name, guest_email, guest_phone,
        guest_management_token_hash, guest_management_token_encrypted
      ) VALUES ($1, $2, $3, $4, 'confirmed', '2026-06-15T10:00:00Z', '2026-06-15T10:30:00Z', 'Alice Smith', 'alice@example.com', '+972500000000', $5, $6)`,
      [
        id,
        orgId,
        serviceId,
        `SL-${id.slice(0, 8)}`,
        encryptedToken ? "fake-hash" : null,
        encryptedToken,
      ],
    );
  }

  it("sends confirmation email with management link for public booking", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();

    await createOrganization(infra.pool, orgId);
    await createService(infra.pool, serviceId, orgId);
    await createBooking(
      infra.pool,
      bookingId,
      orgId,
      serviceId,
      encryptedTokenEnvelope,
    );

    const emailService = new FakeTransactionalEmailService();
    const handler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const event: ValidatedBookingEvent = {
      eventId: randomUUID(),
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-TEST-1234",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Alice Smith",
        guestEmail: "alice@example.com",
        guestPhone: "+972500000000",
        priceAgorot: 10000,
      },
    };

    await handler(event);

    expect(emailService.sent.length).toBe(1);
    const sent = emailService.sent[0];
    expect(sent).toBeDefined();
    if (!sent) throw new Error("sent is undefined");
    expect(sent.to).toBe("alice@example.com");
    expect(sent.subject).toBe("Booking confirmed — SL-TEST-1234");
    expect(sent.idempotencyKey).toBe(`booking-email/${event.eventId}`);
    expect(sent.text).toContain(
      `http://localhost:5173/booking/manage#token=${rawToken}`,
    );

    // Check consumer receipt in DB
    const receipt = await infra.pool.query(
      `SELECT * FROM consumer_receipt WHERE consumer_name = 'booking-email-v1' AND event_id = $1`,
      [event.eventId],
    );
    expect(receipt.rows.length).toBe(1);
    expect(receipt.rows[0].outcome).toBe("email_sent");
  });

  it("sends confirmation email without management link for manual booking", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();

    await createOrganization(infra.pool, orgId);
    await createService(infra.pool, serviceId, orgId);
    await createBooking(infra.pool, bookingId, orgId, serviceId, null);

    const emailService = new FakeTransactionalEmailService();
    const handler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const event: ValidatedBookingEvent = {
      eventId: randomUUID(),
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-MANUAL-1234",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Bob Jones",
        guestEmail: "bob@example.com",
        guestPhone: null,
        priceAgorot: null,
      },
    };

    await handler(event);

    expect(emailService.sent.length).toBe(1);
    const sent = emailService.sent[0];
    expect(sent).toBeDefined();
    if (!sent) throw new Error("sent is undefined");
    expect(sent.to).toBe("bob@example.com");
    expect(sent.text).not.toContain("Manage booking:");
  });

  it("records skipped_no_email and sends no email when guestEmail is null", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();

    await createOrganization(infra.pool, orgId);
    await createService(infra.pool, serviceId, orgId);
    await createBooking(infra.pool, bookingId, orgId, serviceId, null);

    const emailService = new FakeTransactionalEmailService();
    const handler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const event: ValidatedBookingEvent = {
      eventId: randomUUID(),
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-NOEMAIL-1234",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Bob Jones",
        guestEmail: null,
        guestPhone: null,
        priceAgorot: null,
      },
    };

    await handler(event);

    expect(emailService.sent.length).toBe(0);

    const receipt = await infra.pool.query(
      `SELECT * FROM consumer_receipt WHERE consumer_name = 'booking-email-v1' AND event_id = $1`,
      [event.eventId],
    );
    expect(receipt.rows.length).toBe(1);
    expect(receipt.rows[0].outcome).toBe("skipped_no_email");
  });

  it("throws PermanentEventError on aggregate ID mismatch", async () => {
    const emailService = new FakeTransactionalEmailService();
    const handler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const event: ValidatedBookingEvent = {
      eventId: randomUUID(),
      aggregateType: "booking",
      aggregateId: randomUUID(),
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId: randomUUID(), // mismatch!
        organizationId: randomUUID(),
        resourceId: randomUUID(),
        serviceId: randomUUID(),
        publicReference: "SL-MISMATCH",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Alice",
        guestEmail: "alice@example.com",
        guestPhone: null,
        priceAgorot: null,
      },
    };

    await expect(handler(event)).rejects.toThrow(PermanentEventError);
  });

  it("throws PermanentEventError if booking is not found in database", async () => {
    const emailService = new FakeTransactionalEmailService();
    const handler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const missingBookingId = randomUUID();
    const event: ValidatedBookingEvent = {
      eventId: randomUUID(),
      aggregateType: "booking",
      aggregateId: missingBookingId,
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId: missingBookingId,
        organizationId: randomUUID(),
        resourceId: randomUUID(),
        serviceId: randomUUID(),
        publicReference: "SL-MISSING",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Alice",
        guestEmail: "alice@example.com",
        guestPhone: null,
        priceAgorot: null,
      },
    };

    await expect(handler(event)).rejects.toThrow(PermanentEventError);
  });
});
