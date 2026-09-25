import { ISO_WEEKDAY_NAMES } from "./constants";

/**
 * Returns today's calendar date in Asia/Jerusalem timezone formatted as "YYYY-MM-DD".
 */
export function getJerusalemTodayDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Extracts ISO weekday (1=Monday ... 7=Sunday) for a strict "YYYY-MM-DD" calendar date.
 */
export function getIsoWeekdayForDate(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return 1;
  }
  const [year, month, day] = parts;
  const d = new Date(Date.UTC(year, month - 1, day));
  const utcDay = d.getUTCDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  return utcDay === 0 ? 7 : utcDay;
}

/**
 * Returns a human-friendly display label for a date string (e.g. "Sunday, October 4, 2026").
 */
export function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return dateStr;
  }
  const weekday = getIsoWeekdayForDate(dateStr);
  const weekdayName = ISO_WEEKDAY_NAMES[weekday] ?? "";
  return `${weekdayName}, ${dateStr}`;
}
