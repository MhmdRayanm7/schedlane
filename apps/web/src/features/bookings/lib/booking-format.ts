import { DateTime } from "luxon";
import { formatLocalDate, SCHEDULING_TIMEZONE } from "@/shared/lib/date-time";
import type { ManagementBooking } from "../types";

export function bookingDateTime(instant: string) {
  return DateTime.fromISO(instant, { setZone: true }).setZone(
    SCHEDULING_TIMEZONE,
  );
}

export function bookingLocalDate(booking: ManagementBooking) {
  return formatLocalDate(bookingDateTime(booking.startAt));
}

export function formatBookingTime(instant: string) {
  return bookingDateTime(instant).toFormat("HH:mm");
}

export function formatBookingTimeRange(booking: ManagementBooking) {
  return `${formatBookingTime(booking.startAt)}–${formatBookingTime(booking.serviceEndAt)}`;
}

export function groupBookingsByLocalDate(bookings: ManagementBooking[]) {
  return bookings.reduce<Map<string, ManagementBooking[]>>(
    (groups, booking) => {
      const date = bookingLocalDate(booking);
      const existing = groups.get(date);
      if (existing) existing.push(booking);
      else groups.set(date, [booking]);
      return groups;
    },
    new Map(),
  );
}
