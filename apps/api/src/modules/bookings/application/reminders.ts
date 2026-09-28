import type { Transaction } from "kysely";
import type { BookingStatus, Database } from "../../../db-types.js";
import { eligibleBookingReminderDueAt } from "../domain/reminder-policy.js";

type ReminderBookingState = {
  id: string;
  status: BookingStatus;
  guestEmail: string | null;
  startAt: Date;
};

export async function cancelPendingBookingReminderInTransaction(
  trx: Transaction<Database>,
  bookingId: string,
  now: Date,
): Promise<void> {
  await trx
    .updateTable("booking_reminder")
    .set({ status: "cancelled", cancelled_at: now })
    .where("booking_id", "=", bookingId)
    .where("status", "=", "pending")
    .execute();
}

export async function syncBookingReminderInTransaction(
  trx: Transaction<Database>,
  booking: ReminderBookingState,
  now: Date,
  options: { appointmentChanged?: boolean } = {},
): Promise<void> {
  const dueAt = eligibleBookingReminderDueAt({
    status: booking.status,
    guestEmail: booking.guestEmail,
    startAt: booking.startAt,
    now,
  });

  const pending = await trx
    .selectFrom("booking_reminder")
    .select(["id", "scheduled_for_start_at"])
    .where("booking_id", "=", booking.id)
    .where("status", "=", "pending")
    .forUpdate()
    .executeTakeFirst();

  if (
    pending &&
    (!dueAt ||
      pending.scheduled_for_start_at.getTime() !== booking.startAt.getTime())
  ) {
    await cancelPendingBookingReminderInTransaction(trx, booking.id, now);
  }

  if (!dueAt) return;
  if (pending?.scheduled_for_start_at.getTime() === booking.startAt.getTime())
    return;

  if (!options.appointmentChanged) {
    const alreadyDispatched = await trx
      .selectFrom("booking_reminder")
      .select("id")
      .where("booking_id", "=", booking.id)
      .where("scheduled_for_start_at", "=", booking.startAt)
      .where("status", "in", ["dispatched", "sent"])
      .executeTakeFirst();
    if (alreadyDispatched) return;
  }

  await trx
    .insertInto("booking_reminder")
    .values({
      booking_id: booking.id,
      scheduled_for_start_at: booking.startAt,
      due_at: dueAt,
      status: "pending",
      dispatched_at: null,
      sent_at: null,
      cancelled_at: null,
      skipped_at: null,
      skip_reason: null,
    })
    .execute();
}
