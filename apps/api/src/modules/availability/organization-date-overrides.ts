import { isLocalDate } from "./local-date.js";
import {
  type MinuteInterval,
  normalizeMinuteIntervals,
} from "./minute-interval.js";

export type DateOverrideConfiguration = {
  mode: "inherit" | "closed" | "custom";
  intervals: MinuteInterval[];
};

export type OrganizationDateOverride = DateOverrideConfiguration & {
  timezone: "Asia/Jerusalem";
  date: string;
};

export function normalizeDateOverride(
  date: string,
  configuration: DateOverrideConfiguration,
): OrganizationDateOverride | null {
  if (!isLocalDate(date)) return null;
  const { mode } = configuration;
  if (mode === "inherit" || mode === "closed") {
    if (configuration.intervals.length !== 0) return null;
  } else if (mode === "custom") {
    if (configuration.intervals.length === 0) return null;
  } else return null;
  const intervals = normalizeMinuteIntervals(configuration.intervals);
  if (!intervals) return null;
  return { timezone: "Asia/Jerusalem", date, mode, intervals };
}
