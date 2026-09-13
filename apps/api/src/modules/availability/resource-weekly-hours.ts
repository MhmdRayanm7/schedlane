import {
  emptyWeeklyHours,
  normalizeWeeklyHours,
  type WeeklyHoursDay,
} from "./weekly-hours.js";

export type ResourceWeeklyHoursDay = WeeklyHoursDay & {
  mode: "inherit" | "closed" | "custom";
};

export type ResourceWeeklyHours = {
  timezone: "Asia/Jerusalem";
  resourceId: string;
  days: ResourceWeeklyHoursDay[];
};

export function emptyResourceWeeklyHours(
  resourceId: string,
): ResourceWeeklyHours {
  const weeklyHours = emptyWeeklyHours();
  return {
    ...weeklyHours,
    resourceId,
    days: weeklyHours.days.map((day) => ({ ...day, mode: "inherit" })),
  };
}

export function normalizeResourceWeeklyHours(
  resourceId: string,
  days: ResourceWeeklyHoursDay[],
): ResourceWeeklyHours | null {
  const normalized = normalizeWeeklyHours(days);
  if (!normalized) return null;
  for (const day of days) {
    if (day.mode === "custom") {
      if (day.intervals.length === 0) return null;
    } else if (day.mode === "inherit" || day.mode === "closed") {
      if (day.intervals.length !== 0) return null;
    } else return null;
  }
  const modes = new Map(days.map((day) => [day.weekday, day.mode]));
  return {
    ...normalized,
    resourceId,
    days: normalized.days.map((day) => ({
      ...day,
      mode: modes.get(day.weekday) ?? "inherit",
    })),
  };
}
