import { DateTime } from "luxon";

export const SCHEDULING_TIMEZONE = "Asia/Jerusalem" as const;
export const LOCAL_DATE_FORMAT = "yyyy-MM-dd" as const;

export function schedulingToday(now = DateTime.now()) {
  return now.setZone(SCHEDULING_TIMEZONE).startOf("day");
}

export function parseSchedulingDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = DateTime.fromFormat(value, LOCAL_DATE_FORMAT, {
    locale: "en",
    zone: SCHEDULING_TIMEZONE,
  }).startOf("day");

  return date.isValid && date.toFormat(LOCAL_DATE_FORMAT) === value
    ? date
    : null;
}

export function formatLocalDate(date: DateTime) {
  return date.setZone(SCHEDULING_TIMEZONE).toFormat(LOCAL_DATE_FORMAT);
}
