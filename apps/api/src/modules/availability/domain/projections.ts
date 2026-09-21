import type { MinuteInterval } from "./minute-interval.js";
import {
  emptyResourceWeeklyHours,
  type ResourceWeeklyHours,
} from "./resource-weekly-hours.js";
import {
  emptyWeeklyHours,
  type OrganizationWeeklyHours,
} from "./weekly-hours.js";

type IntervalRow = { start_minute: number; end_minute: number };
export const toMinuteInterval = (row: IntervalRow): MinuteInterval => ({
  startMinute: row.start_minute,
  endMinute: row.end_minute,
});

export function projectScheduleOverride(
  rows: readonly { start_minute: number | null; end_minute: number | null }[],
) {
  const intervals = rows.flatMap((row) =>
    row.start_minute === null || row.end_minute === null
      ? []
      : [
          toMinuteInterval({
            start_minute: row.start_minute,
            end_minute: row.end_minute,
          }),
        ],
  );
  return {
    mode:
      rows.length === 0
        ? ("inherit" as const)
        : intervals.length === 0
          ? ("closed" as const)
          : ("custom" as const),
    intervals,
  };
}

export function projectOrganizationWeeklyHours(
  rows: readonly (IntervalRow & { weekday: number })[],
): OrganizationWeeklyHours {
  const empty = emptyWeeklyHours();
  return {
    ...empty,
    days: empty.days.map((day) => ({
      ...day,
      intervals: rows
        .filter((row) => row.weekday === day.weekday)
        .map(toMinuteInterval),
    })),
  };
}

export function projectResourceWeeklyHours(
  resourceId: string,
  overrides: readonly { weekday: number }[],
  intervals: readonly (IntervalRow & { weekday: number })[],
): ResourceWeeklyHours {
  const empty = emptyResourceWeeklyHours(resourceId);
  return {
    ...empty,
    days: empty.days.map((day) => {
      if (!overrides.some((row) => row.weekday === day.weekday))
        return { ...day };
      const dayIntervals = intervals
        .filter((row) => row.weekday === day.weekday)
        .map(toMinuteInterval);
      return {
        ...day,
        mode: dayIntervals.length ? "custom" : "closed",
        intervals: dayIntervals,
      };
    }),
  };
}
