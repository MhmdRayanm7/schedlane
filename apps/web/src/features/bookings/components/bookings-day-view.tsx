import styles from "../bookings.module.css";
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
      <div className={styles.emptyState}>
        <h2 className={styles.emptyTitle}>No bookings for this day.</h2>
        <p className={styles.emptyDescription}>
          Appointments will appear here when customers book.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.dayList}>
      {bookings.map((booking) => (
        <li className={styles.dayRow} key={booking.id}>
          <div className={styles.dayTime}>
            {formatBookingTime(booking.startAt)}
          </div>
          <button
            aria-label={`View ${booking.guestName}'s ${booking.serviceName} booking at ${formatBookingTime(booking.startAt)}`}
            className={styles.bookingRow}
            data-status={booking.status}
            aria-pressed={selectedBookingId === booking.id}
            onClick={() => onSelectBooking(booking.id)}
            type="button"
          >
            <span className={styles.bookingCopy}>
              <span className={styles.guest}>{booking.guestName}</span>
              <span className={styles.service}>
                {booking.serviceName} · {booking.resourceName}
              </span>
              <span className={styles.bookingMetadata}>
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
