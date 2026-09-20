import { DateTime } from "luxon";
import { isLocalDate } from "../availability/local-date.js";

export const SCHEDULING_TIMEZONE = "Asia/Jerusalem";

export function localBookingDateRangeToUtc(
  fromDate: string,
  toDate: string,
): { startAt: Date; endExclusiveAt: Date } | null {
  if (!isLocalDate(fromDate) || !isLocalDate(toDate) || fromDate > toDate)
    return null;

  const [fromYear, fromMonth, fromDay] = fromDate.split("-").map(Number);
  const [toYear, toMonth, toDay] = toDate.split("-").map(Number);
  const start = DateTime.fromObject(
    { year: fromYear, month: fromMonth, day: fromDay },
    { zone: SCHEDULING_TIMEZONE },
  ).startOf("day");
  const endExclusive = DateTime.fromObject(
    { year: toYear, month: toMonth, day: toDay },
    { zone: SCHEDULING_TIMEZONE },
  )
    .startOf("day")
    .plus({ days: 1 });
  if (!start.isValid || !endExclusive.isValid) return null;

  return {
    startAt: start.toUTC().toJSDate(),
    endExclusiveAt: endExclusive.toUTC().toJSDate(),
  };
}

export function localBookingStartToUtc(
  date: string,
  startMinute: number,
): Date | null {
  if (
    !isLocalDate(date) ||
    !Number.isInteger(startMinute) ||
    startMinute < 0 ||
    startMinute >= 1440
  )
    return null;

  const [year, month, day] = date.split("-").map(Number);
  const hour = Math.floor(startMinute / 60);
  const minute = startMinute % 60;
  const local = DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: SCHEDULING_TIMEZONE },
  );
  if (
    !local.isValid ||
    local.toFormat("yyyy-MM-dd") !== date ||
    local.hour !== hour ||
    local.minute !== minute ||
    local.getPossibleOffsets().length !== 1
  )
    return null;

  return local.toUTC().toJSDate();
}

export function calculateBookingTemporalSnapshot(
  startAt: Date,
  durationMinutes: number,
  bufferAfterMinutes: number,
) {
  const serviceEndAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const occupiedUntilAt = new Date(
    serviceEndAt.getTime() + bufferAfterMinutes * 60_000,
  );
  return { serviceEndAt, occupiedUntilAt };
}
