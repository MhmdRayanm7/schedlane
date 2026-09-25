import type { MinuteInterval } from "../types";

/**
 * Converts a minute of the day (0..1440) to "HH:mm" representation.
 * Supports the end-of-day value 24:00 = 1440 without converting to 00:00.
 */
export function minuteToTime(minute: number): string {
  if (minute === 1440) {
    return "24:00";
  }
  const clamped = Math.max(0, Math.min(1439, Math.floor(minute)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Parses a "HH:mm" or "H:mm" string to minute of day (0..1440).
 * Supports "24:00" = 1440.
 * Returns null if the format or values are invalid.
 */
export function timeToMinute(timeStr: string): number | null {
  const trimmed = timeStr.trim();
  if (trimmed === "24:00") {
    return 1440;
  }
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const mins = Number.parseInt(match[2], 10);
  return hours * 60 + mins;
}

/**
 * Validates a single MinuteInterval.
 * Returns an error message string or null if valid.
 */
export function validateInterval(interval: MinuteInterval): string | null {
  if (
    Number.isNaN(interval.startMinute) ||
    interval.startMinute < 0 ||
    interval.startMinute > 1439
  ) {
    return "Start time must be between 00:00 and 23:59.";
  }
  if (
    Number.isNaN(interval.endMinute) ||
    interval.endMinute < 1 ||
    interval.endMinute > 1440
  ) {
    return "End time must be between 00:01 and 24:00.";
  }
  if (interval.startMinute >= interval.endMinute) {
    return "Start time must be earlier than end time.";
  }
  return null;
}

/**
 * Validates an array of MinuteIntervals: individual bounds, no duplicates, no overlaps.
 * Returns an error message string or null if valid.
 */
export function validateIntervals(intervals: MinuteInterval[]): string | null {
  for (const interval of intervals) {
    const error = validateInterval(interval);
    if (error) return error;
  }

  const sorted = [...intervals].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (
      current.startMinute === next.startMinute &&
      current.endMinute === next.endMinute
    ) {
      return "Duplicate intervals are not allowed.";
    }
    if (current.endMinute > next.startMinute) {
      return "Intervals must not overlap.";
    }
  }

  return null;
}

/**
 * Formats a MinuteInterval for human display (e.g. "09:00 – 17:00").
 */
export function formatInterval(interval: MinuteInterval): string {
  return `${minuteToTime(interval.startMinute)} – ${minuteToTime(interval.endMinute)}`;
}

/**
 * Returns a summary string for a list of intervals.
 */
export function formatIntervalsSummary(intervals: MinuteInterval[]): string {
  if (!intervals || intervals.length === 0) {
    return "Closed";
  }
  return intervals.map(formatInterval).join(", ");
}

/**
 * Checks if two sets of MinuteIntervals are semantically equivalent.
 */
export function areIntervalsEqual(
  a: MinuteInterval[],
  b: MinuteInterval[],
): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort(
    (x, y) => x.startMinute - y.startMinute || x.endMinute - y.endMinute,
  );
  const sortedB = [...b].sort(
    (x, y) => x.startMinute - y.startMinute || x.endMinute - y.endMinute,
  );
  return sortedA.every(
    (iv, idx) =>
      iv.startMinute === sortedB[idx].startMinute &&
      iv.endMinute === sortedB[idx].endMinute,
  );
}
