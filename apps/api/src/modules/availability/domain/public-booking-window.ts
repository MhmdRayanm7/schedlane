import { DateTime } from "luxon";
import {
  localBookingStartToUtc,
  SCHEDULING_TIMEZONE,
} from "../../bookings/domain/time.js";
import { isLocalDate } from "./local-date.js";

export type FilterStartsByPublicBookingWindowInput = {
  date: string;
  starts: readonly number[];
  minBookingNoticeMinutes: number;
  maxBookingHorizonDays: number;
  now: Date;
};

export function publicBookingDateWindow(
  now: Date,
  maxBookingHorizonDays: number,
) {
  const today = DateTime.fromJSDate(now, { zone: SCHEDULING_TIMEZONE }).startOf(
    "day",
  );
  if (
    !today.isValid ||
    !Number.isSafeInteger(maxBookingHorizonDays) ||
    maxBookingHorizonDays < 0
  )
    throw new Error(
      "Persisted public Booking settings violated domain invariants",
    );
  const firstDate = today.toISODate();
  const lastDate = today.plus({ days: maxBookingHorizonDays }).toISODate();
  if (!firstDate || !lastDate)
    throw new Error("Public Booking date window could not be calculated");
  return { firstDate, lastDate };
}

export type FilterStartsByPublicBookingWindowResult =
  | { ok: true; starts: number[] }
  | {
      ok: false;
      reason:
        | "invalid_date"
        | "date_outside_booking_window"
        | "invalid_public_booking_window";
    };

export function filterStartsByPublicBookingWindow({
  date,
  starts,
  minBookingNoticeMinutes,
  maxBookingHorizonDays,
  now,
}: Readonly<FilterStartsByPublicBookingWindowInput>): FilterStartsByPublicBookingWindowResult {
  if (!isLocalDate(date)) return { ok: false, reason: "invalid_date" };
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isSafeInteger(minBookingNoticeMinutes) ||
    minBookingNoticeMinutes < 0 ||
    !Number.isSafeInteger(maxBookingHorizonDays) ||
    maxBookingHorizonDays < 0 ||
    starts.some(
      (start) => !Number.isInteger(start) || start < 0 || start >= 24 * 60,
    )
  )
    return { ok: false, reason: "invalid_public_booking_window" };

  const localNow = DateTime.fromJSDate(now, { zone: SCHEDULING_TIMEZONE });
  const localToday = localNow.toISODate();
  const latestAllowedDate = localNow
    .startOf("day")
    .plus({ days: maxBookingHorizonDays })
    .toISODate();
  const earliestAllowedStart = now.getTime() + minBookingNoticeMinutes * 60_000;
  if (
    !localNow.isValid ||
    localToday === null ||
    latestAllowedDate === null ||
    !Number.isFinite(earliestAllowedStart)
  )
    return { ok: false, reason: "invalid_public_booking_window" };

  if (date < localToday || date > latestAllowedDate)
    return { ok: false, reason: "date_outside_booking_window" };

  const filtered = new Set<number>();
  for (const start of starts) {
    const startAt = localBookingStartToUtc(date, start);
    if (startAt && startAt.getTime() >= earliestAllowedStart)
      filtered.add(start);
  }
  return { ok: true, starts: [...filtered].sort((a, b) => a - b) };
}
