import { describe, expect, it } from "vitest";
import { generateCandidateSlotStarts } from "../../../src/modules/availability/domain/candidate-slot-starts.js";

const interval = (startMinute: number, endMinute: number) => ({
  startMinute,
  endMinute,
});

describe("candidate slot starts", () => {
  it.each([
    ["standard interval", [interval(540, 600)], 15, [540, 555, 570, 585]],
    [
      "anchors to the working window rather than the clock grid",
      [interval(550, 620)],
      15,
      [550, 565, 580, 595, 610],
    ],
    [
      "anchors each separate working window independently",
      [interval(540, 600), interval(620, 680)],
      15,
      [540, 555, 570, 585, 620, 635, 650, 665],
    ],
    [
      "excludes the half-open end boundary",
      [interval(540, 600)],
      20,
      [540, 560, 580],
    ],
    [
      "keeps a start when interval exceeds the window",
      [interval(540, 550)],
      15,
      [540],
    ],
    [
      "returns one start for an exact one-step window",
      [interval(540, 555)],
      15,
      [540],
    ],
    ["returns no starts for empty windows", [], 15, []],
    ["accepts the minimum interval", [interval(540, 543)], 1, [540, 541, 542]],
    ["accepts the maximum interval", [interval(0, 1440)], 1440, [0]],
  ])("%s", (_name, windows, slotIntervalMinutes, expected) => {
    expect(generateCandidateSlotStarts(windows, slotIntervalMinutes)).toEqual(
      expected,
    );
  });

  it.each([0, 1441, 1.5])("rejects invalid interval %s", (invalidInterval) => {
    expect(
      generateCandidateSlotStarts([interval(540, 600)], invalidInterval),
    ).toBeNull();
  });

  it("rejects invalid working windows", () => {
    expect(generateCandidateSlotStarts([interval(600, 540)], 15)).toBeNull();
  });

  it("does not mutate input arrays or interval objects", () => {
    const later = Object.freeze(interval(720, 780));
    const earlier = Object.freeze(interval(540, 600));
    const windows = Object.freeze([later, earlier]);
    expect(generateCandidateSlotStarts(windows, 15)).toEqual([
      540, 555, 570, 585, 720, 735, 750, 765,
    ]);
    expect(windows).toEqual([later, earlier]);
    expect(later).toEqual(interval(720, 780));
    expect(earlier).toEqual(interval(540, 600));
  });

  it("sorts valid unsorted windows chronologically", () => {
    expect(
      generateCandidateSlotStarts([interval(720, 750), interval(540, 570)], 15),
    ).toEqual([540, 555, 720, 735]);
  });

  it("deduplicates candidates from overlapping valid windows", () => {
    expect(
      generateCandidateSlotStarts([interval(540, 600), interval(570, 630)], 15),
    ).toEqual([540, 555, 570, 585, 600, 615]);
  });
});
