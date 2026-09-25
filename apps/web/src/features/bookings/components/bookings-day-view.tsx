import {
  formatBookingTime,
  formatBookingTimeRange,
} from "../lib/booking-format";
import type { ManagementBooking } from "../types";
import { BookingStatus } from "./booking-status";

type BookingsDayViewProps = {
  bookings: ManagementBooking[];
  onSelectBooking: (bookingId: string) => void;
  selectedBookingId?: string | null;
};

export function BookingsDayView({
  bookings,
  onSelectBooking,
  selectedBookingId,
}: BookingsDayViewProps) {
  if (bookings.length === 0) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-base font-semibold">No bookings for this day.</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Appointments will appear here when customers book.
        </p>
      </div>
    );
  }

  return (
    <ul className="m-0 list-none divide-y divide-border p-0">
      {bookings.map((booking) => (
        <li className="flex" key={booking.id}>
          <div className="w-[76px] shrink-0 py-4 pr-4 text-sm font-semibold tabular-nums text-foreground sm:w-[88px] sm:py-5">
            {formatBookingTime(booking.startAt)}
          </div>
          <button
            aria-label={`View ${booking.guestName}'s ${booking.serviceName} booking at ${formatBookingTime(booking.startAt)}`}
            className={`flex min-w-0 flex-1 flex-col gap-3 rounded-md px-3 py-4 text-left transition-colors duration-150 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-5 ${
              selectedBookingId === booking.id ? "bg-primary-subtle" : ""
            } ${booking.status === "cancelled" ? "text-muted-foreground" : ""}`}
            onClick={() => onSelectBooking(booking.id)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {booking.guestName}
              </span>
              <span className="mt-1 block truncate text-sm text-muted-foreground">
                {booking.serviceName} · {booking.resourceName}
              </span>
              <span className="mt-1 block text-xs tabular-nums text-subtle-foreground">
                {formatBookingTimeRange(booking)} · {booking.durationMinutes}{" "}
                min
              </span>
            </span>
            <BookingStatus status={booking.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
