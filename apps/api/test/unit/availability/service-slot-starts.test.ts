import { describe, expect, it } from "vitest";
import { generateServiceSlotStarts } from "../../../src/modules/availability/domain/service-slot-starts.js";

const interval = (startMinute: number, endMinute: number) => ({
  startMinute,
  endMinute,
});

describe("Service slot starts", () => {
  it.each([
    [
      "generates candidates and removes starts that cannot fit",
      [interval(540, 660)],
      15,
      45,
      15,
      [540, 555, 570, 585, 600],
    ],
    ["keeps an exact duration fit", [interval(540, 600)], 15, 60, 0, [540]],
    [
      "keeps an exact duration plus buffer fit",
      [interval(540, 600)],
      15,
      45,
      15,
      [540],
    ],
    [
      "uses the buffer to remove trailing candidates",
      [interval(540, 620)],
      15,
      45,
      15,
      [540, 555],
    ],
    [
      "anchors an odd-minute window independently from the clock grid",
      [interval(550, 620)],
      15,
      10,
      0,
      [550, 565, 580, 595, 610],
    ],
    [
      "anchors separated windows independently",
      [interval(540, 600), interval(620, 680)],
      15,
      30,
      0,
      [540, 555, 570, 620, 635, 650],
    ],
    [
      "does not combine adjacent windows for fitting",
      [interval(540, 600), interval(600, 660)],
      60,
      90,
      0,
      [],
    ],
    [
      "rejects a generated candidate when the Service exceeds a small window",
      [interval(540, 550)],
      15,
      11,
      0,
      [],
    ],
    ["returns no starts for empty working windows", [], 15, 30, 0, []],
    [
      "supports a one-minute slot interval and duration",
      [interval(540, 543)],
      1,
      1,
      0,
      [540, 541, 542],
    ],
    [
      "supports the maximum slot interval",
      [interval(0, 1440)],
      1440,
      1440,
      0,
      [0],
    ],
    [
      "supports an arbitrary 17-minute interval",
      [interval(550, 650)],
      17,
      20,
      0,
      [550, 567, 584, 601, 618],
    ],
  ])(
    "%s",
    (_name, workingWindows, slotIntervalMinutes, durationMinutes, bufferAfterMinutes, expected) => {
      expect(
        generateServiceSlotStarts(
          workingWindows,
          slotIntervalMinutes,
          durationMinutes,
          bufferAfterMinutes,
        ),
      ).toEqual(expected);
    },
  );

  it.each([
    ["slot interval", 0, 30, 0],
    ["duration", 15, 0, 0],
    ["buffer", 15, 30, -1],
  ])(
    "returns null for an invalid %s",
    (_name, slotIntervalMinutes, durationMinutes, bufferAfterMinutes) => {
      expect(
        generateServiceSlotStarts(
          [interval(540, 600)],
          slotIntervalMinutes,
          durationMinutes,
          bufferAfterMinutes,
        ),
      ).toBeNull();
    },
  );

  it("returns null for an invalid working window", () => {
    expect(
      generateServiceSlotStarts([interval(600, 540)], 15, 30, 0),
    ).toBeNull();
  });

  it("does not mutate working-window arrays or objects", () => {
    const later = Object.freeze(interval(700, 760));
    const earlier = Object.freeze(interval(550, 620));
    const workingWindows = Object.freeze([later, earlier]);
    expect(generateServiceSlotStarts(workingWindows, 15, 30, 0)).toEqual([
      550, 565, 580, 700, 715, 730,
    ]);
    expect(workingWindows).toEqual([later, earlier]);
    expect(later).toEqual(interval(700, 760));
    expect(earlier).toEqual(interval(550, 620));
  });
});
