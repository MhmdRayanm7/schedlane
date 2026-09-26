import type { DateTime } from "luxon";
import { cn } from "@/shared/lib/cn";
import { formatLocalDate } from "@/shared/lib/date-time";
import { weekDates } from "../lib/booking-date-range";
import {
  formatBookingTime,
  groupBookingsByLocalDate,
} from "../lib/booking-format";
import type { ManagementBooking } from "../types";
import { BookingStatus } from "./booking-status";

type BookingsWeekViewProps = {
  bookings: ManagementBooking[];
  date: DateTime;
  onSelectBooking: (bookingId: string) => void;
  selectedBookingId?: string | null;
  today: DateTime;
};

function WeekBooking({
  booking,
  onSelectBooking,
  selected,
}: {
  booking: ManagementBooking;
  onSelectBooking: (bookingId: string) => void;
  selected: boolean;
}) {
  return (
    <button
      aria-label={`View ${booking.guestName}'s ${booking.serviceName} booking at ${formatBookingTime(booking.startAt)}`}
      className={cn(
        "w-full rounded-md border border-border bg-surface px-2.5 py-2.5 text-left",
        "transition-colors duration-150",
        "hover:border-border-strong hover:bg-surface-hover",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        selected && "border-primary bg-primary-subtle",
        booking.status === "cancelled" && "text-muted-foreground",
      )}
      aria-pressed={selected}
      onClick={() => onSelectBooking(booking.id)}
      type="button"
    >
      <span className="block text-xs font-semibold tabular-nums">
        {formatBookingTime(booking.startAt)}
      </span>
      <span className="mt-1 block truncate text-sm font-medium text-foreground">
        {booking.guestName}
      </span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
        {booking.serviceName}
      </span>
      <span className="mt-2 block">
        <BookingStatus status={booking.status} />
      </span>
    </button>
  );
}

export function BookingsWeekView({
  bookings,
  date,
  onSelectBooking,
  selectedBookingId,
  today,
}: BookingsWeekViewProps) {
  if (bookings.length === 0) {
    return (
      <div className="py-10 text-center">
        <h2 className="text-base font-semibold">No bookings for this week.</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Appointments will appear here when customers book.
        </p>
      </div>
    );
  }

  const dates = weekDates(date);
  const groupedBookings = groupBookingsByLocalDate(bookings);

  return (
    <>
      <div className="hidden grid-cols-7 divide-x divide-border xl:grid">
        {dates.map((day) => {
          const localDate = formatLocalDate(day);
          const dayBookings = groupedBookings.get(localDate) ?? [];
          const isToday = localDate === formatLocalDate(today);

          return (
            <section
              className="min-w-0 px-2.5 py-4 first:pl-0 last:pr-0"
              key={localDate}
            >
              <header className={cn("mb-3 px-1", isToday && "text-primary")}>
                <p className="text-[11px] font-semibold uppercase">
                  {day.toFormat("ccc")}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {day.day}
                </p>
              </header>
              <div className="space-y-2">
                {dayBookings.length > 0 ? (
                  dayBookings.map((booking) => (
                    <WeekBooking
                      booking={booking}
                      key={booking.id}
                      onSelectBooking={onSelectBooking}
                      selected={booking.id === selectedBookingId}
                    />
                  ))
                ) : (
                  <p className="px-1 py-2 text-xs text-subtle-foreground">
                    No bookings
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="divide-y divide-border xl:hidden">
        {dates.map((day) => {
          const localDate = formatLocalDate(day);
          const dayBookings = groupedBookings.get(localDate) ?? [];
          const isToday = localDate === formatLocalDate(today);

          return (
            <section className="py-5" key={localDate}>
              <header className={cn("mb-3", isToday && "text-primary")}>
                <h2 className="text-sm font-semibold">
                  {day.toFormat("cccc, LLL d")}
                </h2>
              </header>
              <div className="space-y-2">
                {dayBookings.length > 0 ? (
                  dayBookings.map((booking) => (
                    <WeekBooking
                      booking={booking}
                      key={booking.id}
                      onSelectBooking={onSelectBooking}
                      selected={booking.id === selectedBookingId}
                    />
                  ))
                ) : (
                  <p className="py-1 text-xs text-subtle-foreground">
                    No bookings
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
