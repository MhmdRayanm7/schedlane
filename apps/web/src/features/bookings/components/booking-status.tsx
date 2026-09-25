import type { BookingStatus as BookingStatusValue } from "../types";

const statuses = {
  confirmed: {
    label: "Confirmed",
    className: "bg-primary-subtle text-primary",
    dotClassName: "bg-primary",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-destructive-subtle text-destructive",
    dotClassName: "bg-destructive",
  },
  no_show: {
    label: "No-show",
    className: "bg-warning-subtle text-warning",
    dotClassName: "bg-warning",
  },
} as const;

export function BookingStatus({ status }: { status: BookingStatusValue }) {
  const presentation = statuses[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${presentation.className}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${presentation.dotClassName}`}
      />
      {presentation.label}
    </span>
  );
}
