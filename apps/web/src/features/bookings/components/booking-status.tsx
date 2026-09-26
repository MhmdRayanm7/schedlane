import styles from "../bookings.module.css";
import type { BookingStatus as BookingStatusValue } from "../types";

const statuses = {
  confirmed: {
    label: "Confirmed",
  },
  cancelled: {
    label: "Cancelled",
  },
  no_show: {
    label: "No-show",
  },
} as const;

export function BookingStatus({ status }: { status: BookingStatusValue }) {
  const presentation = statuses[status];

  return (
    <span className={styles.status} data-status={status}>
      <span aria-hidden="true" className={styles.statusDot} />
      {presentation.label}
    </span>
  );
}
