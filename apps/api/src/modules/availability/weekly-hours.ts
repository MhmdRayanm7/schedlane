export type WeeklyHoursDay = {
  weekday: number;
  intervals: Array<{ startMinute: number; endMinute: number }>;
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
  days: WeeklyHoursDay[],
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
    const intervals = day.intervals
      .map((interval) => ({ ...interval }))
      .sort((a, b) => a.startMinute - b.startMinute);
    let previousEnd = 0;
    for (const { startMinute, endMinute } of intervals) {
      if (
        !Number.isInteger(startMinute) ||
        !Number.isInteger(endMinute) ||
        startMinute < 0 ||
        startMinute >= 1440 ||
        endMinute <= 0 ||
        endMinute > 1440 ||
        startMinute >= endMinute ||
        startMinute < previousEnd
      )
        return null;
      previousEnd = endMinute;
    }
    normalized.days[day.weekday - 1] = { weekday: day.weekday, intervals };
  }
  return normalized;
}
