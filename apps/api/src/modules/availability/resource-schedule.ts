import {
  type DateOverrideConfiguration,
  isLocalDate,
} from "./organization-date-overrides.js";
import type { WeeklyHoursDay } from "./weekly-hours.js";

type Interval = WeeklyHoursDay["intervals"][number];
export type ScheduleOverride = {
  mode: DateOverrideConfiguration["mode"];
  intervals: readonly Readonly<Interval>[];
};
export type AvailabilityLayers = {
  organizationWeekly: readonly Readonly<Interval>[];
  resourceWeekly: ScheduleOverride;
  organizationDate: ScheduleOverride;
  resourceDate: ScheduleOverride;
};

export function isoWeekdayFromLocalDate(date: string): number | null {
  if (!isLocalDate(date)) return null;
  // UTC is used only for calendar arithmetic, never to interpret persisted DATE values.
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() || 7;
}

// Resolves configured working intervals before any blocks, bookings or slot rules.
export function resolveAvailabilityLayers(
  layers: AvailabilityLayers,
): Interval[] {
  // An explicit Organization date closure cannot be reopened by a Resource override.
  if (layers.organizationDate.mode === "closed") return [];
  let intervals = layers.organizationWeekly;
  for (const override of [
    layers.resourceWeekly,
    layers.organizationDate,
    layers.resourceDate,
  ]) {
    if (override.mode === "closed") intervals = [];
    else if (override.mode === "custom") intervals = override.intervals;
  }
  return intervals
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.startMinute - b.startMinute);
}
