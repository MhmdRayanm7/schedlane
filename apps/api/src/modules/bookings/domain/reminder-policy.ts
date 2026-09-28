const REMINDER_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

export type BookingReminderEligibility = {
  status: "confirmed" | "cancelled" | "no_show";
  guestEmail: string | null;
  startAt: Date;
  now: Date;
};

export function bookingReminderDueAt(startAt: Date, now: Date): Date | null {
  return startAt.getTime() > now.getTime() + REMINDER_LEAD_TIME_MS
    ? new Date(startAt.getTime() - REMINDER_LEAD_TIME_MS)
    : null;
}

export function eligibleBookingReminderDueAt({
  status,
  guestEmail,
  startAt,
  now,
}: BookingReminderEligibility): Date | null {
  if (status !== "confirmed" || !guestEmail) return null;
  return bookingReminderDueAt(startAt, now);
}

export const bookingReminderPolicy = { leadTimeMs: REMINDER_LEAD_TIME_MS };
