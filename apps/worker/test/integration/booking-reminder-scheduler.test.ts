import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dispatchDueBookingReminderBatch } from "../../src/bookings/reminders/scheduler.js";
import { startWorkerTestInfrastructure } from "../helpers/test-infrastructure.js";

const infra = await startWorkerTestInfrastructure();
beforeEach(() => infra.reset());
afterAll(() => infra.stop());

async function insertReminder(options: {
  dueAt?: Date;
  startAt?: Date;
  status?: string;
  guestEmail?: string | null;
  bookingStatus?: string;
  suspendedAt?: Date | null;
  archivedAt?: Date | null;
}) {
  const organizationId = randomUUID();
  const serviceId = randomUUID();
  const bookingId = randomUUID();
  const reminderId = randomUUID();
  const startAt = options.startAt ?? new Date("2026-10-02T12:00:00.000Z");
  const dueAt = options.dueAt ?? new Date("2026-10-01T12:00:00.000Z");
  await infra.pool.query(
    `INSERT INTO organization (
       id, name, slug, suspended_at, archived_at
     ) VALUES ($1, 'Test org', $2, $3, $4)`,
    [
      organizationId,
      `org-${organizationId}`,
      options.suspendedAt ?? null,
      options.archivedAt ?? null,
    ],
  );
  await infra.pool.query(
    `INSERT INTO service (
       id, organization_id, name, slug, duration_minutes, price_agorot
     ) VALUES ($1, $2, 'Test service', $3, 30, 2500)`,
    [serviceId, organizationId, `service-${serviceId}`],
  );
  await infra.pool.query(
    `INSERT INTO booking (
       id, organization_id, service_id, public_reference, status, start_at,
       end_at, duration_minutes, price_agorot, guest_name, guest_email
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 30, 2500, 'Guest', $8)`,
    [
      bookingId,
      organizationId,
      serviceId,
      `BK-${bookingId.slice(0, 8)}`,
      options.bookingStatus ?? "confirmed",
      startAt,
      new Date(startAt.getTime() + 30 * 60_000),
      options.guestEmail === undefined
        ? "guest@example.test"
        : options.guestEmail,
    ],
  );
  await infra.pool.query(
    `INSERT INTO booking_reminder (
       id, booking_id, scheduled_for_start_at, due_at, status
     ) VALUES ($1, $2, $3, $4, $5)`,
    [reminderId, bookingId, startAt, dueAt, options.status ?? "pending"],
  );
  return { reminderId, bookingId, startAt };
}

describe("due Booking reminder scheduler", () => {
  const now = new Date("2026-10-01T12:00:01.000Z");

  it("claims only due pending reminders and writes a minimal outbox event atomically", async () => {
    const due = await insertReminder({});
    const future = await insertReminder({
      dueAt: new Date("2026-10-01T12:01:00.000Z"),
      startAt: new Date("2026-10-02T12:01:00.000Z"),
    });
    await insertReminder({ status: "cancelled" });

    expect(
      await dispatchDueBookingReminderBatch({
        pool: infra.pool,
        batchSize: 25,
        now,
      }),
    ).toEqual({ dispatched: 1, skipped: 0 });

    const reminders = await infra.pool.query<{
      id: string;
      status: string;
    }>("SELECT id, status FROM booking_reminder ORDER BY id");
    expect(
      reminders.rows.find((row) => row.id === due.reminderId)?.status,
    ).toBe("dispatched");
    expect(
      reminders.rows.find((row) => row.id === future.reminderId)?.status,
    ).toBe("pending");

    const event = await infra.pool.query<{
      aggregate_id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }>("SELECT aggregate_id, event_type, payload FROM outbox_event");
    expect(event.rows).toEqual([
      {
        aggregate_id: due.bookingId,
        event_type: "booking.reminder_due",
        payload: {
          reminderId: due.reminderId,
          bookingId: due.bookingId,
          scheduledForStartAt: due.startAt.toISOString(),
        },
      },
    ]);
    const serialized = JSON.stringify(event.rows[0]?.payload);
    expect(serialized).not.toMatch(/token|email|guest/i);
  });

  it("respects the bounded batch size", async () => {
    await insertReminder({});
    await insertReminder({});
    await insertReminder({});
    expect(
      await dispatchDueBookingReminderBatch({
        pool: infra.pool,
        batchSize: 2,
        now,
      }),
    ).toEqual({ dispatched: 2, skipped: 0 });
    expect(
      (
        await infra.pool.query(
          "SELECT id FROM booking_reminder WHERE status = 'pending'",
        )
      ).rowCount,
    ).toBe(1);
  });

  it("does not dispatch one reminder twice across concurrent schedulers", async () => {
    await insertReminder({});
    const results = await Promise.all([
      dispatchDueBookingReminderBatch({ pool: infra.pool, batchSize: 25, now }),
      dispatchDueBookingReminderBatch({ pool: infra.pool, batchSize: 25, now }),
    ]);
    expect(results.reduce((sum, result) => sum + result.dispatched, 0)).toBe(1);
    expect(
      (await infra.pool.query("SELECT id FROM outbox_event")).rowCount,
    ).toBe(1);
  });

  it.each([
    [{ bookingStatus: "cancelled" }, "booking_cancelled"],
    [{ guestEmail: null }, "no_email"],
    [
      { suspendedAt: new Date("2026-09-30T00:00:00.000Z") },
      "organization_suspended",
    ],
    [
      { archivedAt: new Date("2026-09-30T00:00:00.000Z") },
      "organization_archived",
    ],
  ] as const)("skips stale due state (%s)", async (options, reason) => {
    await insertReminder(options);
    expect(
      await dispatchDueBookingReminderBatch({
        pool: infra.pool,
        batchSize: 25,
        now,
      }),
    ).toEqual({ dispatched: 0, skipped: 1 });
    expect(
      (
        await infra.pool.query(
          "SELECT status, skip_reason FROM booking_reminder",
        )
      ).rows[0],
    ).toEqual({ status: "skipped", skip_reason: reason });
    expect(
      (await infra.pool.query("SELECT id FROM outbox_event")).rowCount,
    ).toBe(0);
  });
});
