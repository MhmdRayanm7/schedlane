import {
  type MinuteInterval,
  normalizeMinuteIntervals,
} from "./minute-interval.js";

export type WeeklyHoursDay = {
  weekday: number;
  intervals: MinuteInterval[];
};

export type OrganizationWeeklyHours = {
  timezone: "Asia/Jerusalem";
  days: WeeklyHoursDay[];
};

export function emptyWeeklyHours(): OrganizationWeeklyHours {
  return {
    timezone: "Asia/Jerusalem",
    days: Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      intervals: [],
    })),
  };
}

export function normalizeWeeklyHours(
  days: readonly Readonly<WeeklyHoursDay>[],
): OrganizationWeeklyHours | null {
  if (days.length !== 7) return null;
  const weekdays = new Set<number>();
  const normalized = emptyWeeklyHours();
  for (const day of days) {
    if (
      !Number.isInteger(day.weekday) ||
      day.weekday < 1 ||
      day.weekday > 7 ||
      weekdays.has(day.weekday)
    )
      return null;
    weekdays.add(day.weekday);
    const intervals = normalizeMinuteIntervals(day.intervals);
    if (!intervals) return null;
    normalized.days[day.weekday - 1] = { weekday: day.weekday, intervals };
  }
  return normalized;
}
