import type { DateTime } from "luxon";
import {
  formatLocalDate,
  parseSchedulingDate,
  schedulingToday,
} from "@/shared/lib/date-time";

export type BookingsView = "day" | "week";

export type BookingDateRange = {
  fromDate: string;
  toDate: string;
  weekEnd: DateTime;
  weekStart: DateTime;
};

export function resolveBookingsUrlState(
  dateParam: string | null,
  viewParam: string | null,
  today = schedulingToday(),
) {
  const date = parseSchedulingDate(dateParam) ?? today;
  const view: BookingsView = viewParam === "week" ? "week" : "day";

  return { date, view };
}

export function sundayStart(date: DateTime) {
  return date.minus({ days: date.weekday % 7 }).startOf("day");
}

export function bookingDateRange(
  date: DateTime,
  view: BookingsView,
): BookingDateRange {
  const weekStart = sundayStart(date);
  const weekEnd = weekStart.plus({ days: 6 });

  return view === "day"
    ? {
        fromDate: formatLocalDate(date),
        toDate: formatLocalDate(date),
        weekStart,
        weekEnd,
      }
    : {
        fromDate: formatLocalDate(weekStart),
        toDate: formatLocalDate(weekEnd),
        weekStart,
        weekEnd,
      };
}

export function moveBookingDate(
  date: DateTime,
  view: BookingsView,
  direction: -1 | 1,
) {
  return date.plus({ days: direction * (view === "week" ? 7 : 1) });
}

export function bookingRangeLabel(
  date: DateTime,
  view: BookingsView,
  today = schedulingToday(),
) {
  if (view === "day") {
    return date.toFormat(
      date.year === today.year ? "cccc, LLLL d" : "cccc, LLLL d, yyyy",
    );
  }

  const { weekStart, weekEnd } = bookingDateRange(date, "week");
  if (weekStart.year !== weekEnd.year) {
    return `${weekStart.toFormat("LLL d, yyyy")} – ${weekEnd.toFormat("LLL d, yyyy")}`;
  }
  if (weekStart.month === weekEnd.month) {
    return `${weekStart.toFormat("LLL d")} – ${weekEnd.toFormat("d, yyyy")}`;
  }
  return `${weekStart.toFormat("LLL d")} – ${weekEnd.toFormat("LLL d, yyyy")}`;
}

export function weekDates(date: DateTime) {
  const start = sundayStart(date);
  return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }));
}
