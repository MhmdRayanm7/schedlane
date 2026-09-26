import type { DateTime } from "luxon";
import { formatLocalDate } from "@/shared/lib/date-time";
import styles from "../bookings.module.css";
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
      className={styles.weekBooking}
      data-status={booking.status}
      aria-pressed={selected}
      onClick={() => onSelectBooking(booking.id)}
      type="button"
    >
      <span className={styles.weekTime}>
        {formatBookingTime(booking.startAt)}
      </span>
      <span className={styles.weekGuest}>{booking.guestName}</span>
      <span className={styles.weekService}>{booking.serviceName}</span>
      <span className={styles.weekStatus}>
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
      <div className={styles.emptyState}>
        <h2 className={styles.emptyTitle}>No bookings for this week.</h2>
        <p className={styles.emptyDescription}>
          Appointments will appear here when customers book.
        </p>
      </div>
    );
  }

  const dates = weekDates(date);
  const groupedBookings = groupBookingsByLocalDate(bookings);

  return (
    <>
      <div className={styles.desktopWeek}>
        {dates.map((day) => {
          const localDate = formatLocalDate(day);
          const dayBookings = groupedBookings.get(localDate) ?? [];
          const isToday = localDate === formatLocalDate(today);

          return (
            <section className={styles.weekDay} key={localDate}>
              <header
                className={styles.dayHeader}
                data-today={isToday || undefined}
              >
                <p className={styles.weekday}>{day.toFormat("ccc")}</p>
                <p className={styles.dayNumber}>{day.day}</p>
              </header>
              <div className={styles.weekBookings}>
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
                  <p className={styles.noBookings}>No bookings</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className={styles.mobileWeek}>
        {dates.map((day) => {
          const localDate = formatLocalDate(day);
          const dayBookings = groupedBookings.get(localDate) ?? [];
          const isToday = localDate === formatLocalDate(today);

          return (
            <section className={styles.mobileDay} key={localDate}>
              <header
                className={styles.mobileDayHeader}
                data-today={isToday || undefined}
              >
                <h2 className={styles.mobileDayTitle}>
                  {day.toFormat("cccc, LLL d")}
                </h2>
              </header>
              <div className={styles.weekBookings}>
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
                  <p className={styles.noBookings}>No bookings</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
