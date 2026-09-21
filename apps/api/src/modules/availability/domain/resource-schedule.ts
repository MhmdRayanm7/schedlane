import type { MinuteInterval } from "./minute-interval.js";
import type { DateOverrideConfiguration } from "./organization-date-overrides.js";

export type ScheduleOverride = {
  mode: DateOverrideConfiguration["mode"];
  intervals: readonly Readonly<MinuteInterval>[];
};
export type AvailabilityLayers = {
  organizationWeekly: readonly Readonly<MinuteInterval>[];
  resourceWeekly: ScheduleOverride;
  organizationDate: ScheduleOverride;
  resourceDate: ScheduleOverride;
};

// Resolves configured working intervals before any blocks, bookings or slot rules.
export function resolveAvailabilityLayers(
  layers: AvailabilityLayers,
): MinuteInterval[] {
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
