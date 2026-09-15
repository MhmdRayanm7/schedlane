import type { MinuteInterval } from "./minute-interval.js";

// Subtract half-open intervals, preserving each configured working interval's boundaries.
export function subtractIntervals(
  working: readonly Readonly<MinuteInterval>[],
  blocked: readonly Readonly<MinuteInterval>[],
): MinuteInterval[] {
  const sortedBlocks = [...blocked].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );
  const result: MinuteInterval[] = [];
  for (const window of working) {
    let cursor = window.startMinute;
    for (const block of sortedBlocks) {
      if (block.startMinute >= window.endMinute) break;
      if (block.endMinute <= cursor || block.startMinute >= block.endMinute)
        continue;
      if (block.startMinute > cursor)
        result.push({ startMinute: cursor, endMinute: block.startMinute });
      // Overlapping or contained blocks can only advance the cursor.
      cursor = Math.max(cursor, block.endMinute);
      if (cursor >= window.endMinute) break;
    }
    if (cursor < window.endMinute)
      result.push({ startMinute: cursor, endMinute: window.endMinute });
  }
  return result.sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );
}
