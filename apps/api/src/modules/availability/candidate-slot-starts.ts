import { isMinuteInterval, type MinuteInterval } from "./minute-interval.js";

export function generateCandidateSlotStarts(
  workingWindows: readonly Readonly<MinuteInterval>[],
  slotIntervalMinutes: number,
): number[] | null {
  if (
    !Number.isInteger(slotIntervalMinutes) ||
    slotIntervalMinutes < 1 ||
    slotIntervalMinutes > 1440
  )
    return null;

  const sortedWindows = [...workingWindows].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );
  const candidateStarts = new Set<number>();
  for (const window of sortedWindows) {
    if (!isMinuteInterval(window)) return null;
    for (
      let candidateStart = window.startMinute;
      candidateStart < window.endMinute;
      candidateStart += slotIntervalMinutes
    )
      candidateStarts.add(candidateStart);
  }
  return [...candidateStarts].sort((a, b) => a - b);
}
