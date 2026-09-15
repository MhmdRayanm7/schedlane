import { generateCandidateSlotStarts } from "./candidate-slot-starts.js";
import type { MinuteInterval } from "./minute-interval.js";
import { filterCandidateSlotStartsByServiceFit } from "./service-slot-fitting.js";

export function generateServiceSlotStarts(
  workingWindows: readonly Readonly<MinuteInterval>[],
  slotIntervalMinutes: number,
  durationMinutes: number,
  bufferAfterMinutes: number,
): number[] | null {
  const candidateStarts = generateCandidateSlotStarts(
    workingWindows,
    slotIntervalMinutes,
  );
  if (candidateStarts === null) return null;
  return filterCandidateSlotStartsByServiceFit(
    workingWindows,
    candidateStarts,
    durationMinutes,
    bufferAfterMinutes,
  );
}
