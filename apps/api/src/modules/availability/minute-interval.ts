export type MinuteInterval = {
  startMinute: number;
  endMinute: number;
};

export function isMinuteInterval(interval: Readonly<MinuteInterval>): boolean {
  return (
    Number.isInteger(interval.startMinute) &&
    Number.isInteger(interval.endMinute) &&
    interval.startMinute >= 0 &&
    interval.startMinute < 1440 &&
    interval.endMinute > 0 &&
    interval.endMinute <= 1440 &&
    interval.startMinute < interval.endMinute
  );
}

export function normalizeMinuteIntervals(
  intervals: readonly Readonly<MinuteInterval>[],
): MinuteInterval[] | null {
  const normalized = intervals
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  let previousEnd = 0;
  for (const interval of normalized) {
    if (!isMinuteInterval(interval) || interval.startMinute < previousEnd)
      return null;
    previousEnd = interval.endMinute;
  }
  return normalized;
}
