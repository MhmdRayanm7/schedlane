import { isMinuteInterval, type MinuteInterval } from "./minute-interval.js";

export function filterCandidateSlotStartsByServiceFit(
  workingWindows: readonly Readonly<MinuteInterval>[],
  candidateStarts: readonly number[],
  durationMinutes: number,
  bufferAfterMinutes: number,
): number[] | null {
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isInteger(bufferAfterMinutes) ||
    bufferAfterMinutes < 0
  )
    return null;

  const occupiedMinutes = durationMinutes + bufferAfterMinutes;
  if (!Number.isSafeInteger(occupiedMinutes)) return null;

  const sortedWindows = [...workingWindows];
  for (const window of sortedWindows) {
    if (!isMinuteInterval(window)) return null;
  }
  sortedWindows.sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );

  const uniqueCandidateStarts = new Set<number>();
  for (const candidateStart of candidateStarts) {
    if (
      !Number.isInteger(candidateStart) ||
      candidateStart < 0 ||
      candidateStart >= 1440 ||
      !Number.isSafeInteger(candidateStart + occupiedMinutes)
    )
      return null;
    uniqueCandidateStarts.add(candidateStart);
  }

  return [...uniqueCandidateStarts]
    .sort((a, b) => a - b)
    .filter((candidateStart) =>
      sortedWindows.some(
        (window) =>
          candidateStart >= window.startMinute &&
          candidateStart + occupiedMinutes <= window.endMinute,
      ),
    );
}
