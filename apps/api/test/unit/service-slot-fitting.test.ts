import { describe, expect, it } from "vitest";
import { filterCandidateSlotStartsByServiceFit } from "../../src/modules/availability/service-slot-fitting.js";

const interval = (startMinute: number, endMinute: number) => ({
  startMinute,
  endMinute,
});

describe("service slot fitting", () => {
  it.each([
    [
      "exact duration and buffer fit",
      [interval(540, 600)],
      [540],
      45,
      15,
      [540],
    ],
    ["buffer rejects a later start", [interval(540, 600)], [555], 45, 15, []],
    ["exact duration-only fit", [interval(540, 600)], [540], 60, 0, [540]],
    ["one minute too long", [interval(540, 600)], [540], 61, 0, []],
    [
      "does not merge adjacent windows",
      [interval(540, 600), interval(600, 660)],
      [540],
      90,
      0,
      [],
    ],
    [
      "fits in a later window",
      [interval(540, 600), interval(600, 660)],
      [600],
      60,
      0,
      [600],
    ],
    ["rejects starts before a window", [interval(540, 600)], [525], 15, 0, []],
    ["rejects starts at a window end", [interval(540, 600)], [600], 1, 0, []],
    [
      "filters across multiple windows",
      [interval(540, 600), interval(660, 750)],
      [540, 585, 660, 690, 720],
      30,
      0,
      [540, 660, 690, 720],
    ],
    [
      "deduplicates candidates",
      [interval(540, 600)],
      [540, 540, 555],
      15,
      0,
      [540, 555],
    ],
    [
      "sorts unsorted inputs chronologically",
      [interval(660, 720), interval(540, 600)],
      [675, 555, 540],
      15,
      0,
      [540, 555, 675],
    ],
    ["keeps empty candidates empty", [interval(540, 600)], [], 15, 0, []],
    ["keeps both inputs empty", [], [], 15, 0, []],
    ["has no matches for empty windows", [], [540], 15, 0, []],
  ])(
    "%s",
    (_name, windows, candidates, durationMinutes, bufferAfterMinutes, expected) => {
      expect(
        filterCandidateSlotStartsByServiceFit(
          windows,
          candidates,
          durationMinutes,
          bufferAfterMinutes,
        ),
      ).toEqual(expected);
    },
  );

  it.each([0, -1, 1.5])("rejects invalid duration %s", (durationMinutes) => {
    expect(
      filterCandidateSlotStartsByServiceFit(
        [interval(540, 600)],
        [540],
        durationMinutes,
        0,
      ),
    ).toBeNull();
  });

  it.each([-1, 0.5])("rejects invalid buffer %s", (bufferAfterMinutes) => {
    expect(
      filterCandidateSlotStartsByServiceFit(
        [interval(540, 600)],
        [540],
        15,
        bufferAfterMinutes,
      ),
    ).toBeNull();
  });

  it.each([-1, 1440, 540.5])("rejects invalid candidate %s", (candidate) => {
    expect(
      filterCandidateSlotStartsByServiceFit(
        [interval(540, 600)],
        [candidate],
        15,
        0,
      ),
    ).toBeNull();
  });

  it("rejects invalid working windows", () => {
    expect(
      filterCandidateSlotStartsByServiceFit([interval(600, 540)], [540], 15, 0),
    ).toBeNull();
  });

  it("rejects unsafe occupied-end arithmetic", () => {
    expect(
      filterCandidateSlotStartsByServiceFit(
        [interval(0, 1440)],
        [1],
        Number.MAX_SAFE_INTEGER,
        0,
      ),
    ).toBeNull();
  });

  it("does not mutate input arrays or interval objects", () => {
    const later = Object.freeze(interval(660, 720));
    const earlier = Object.freeze(interval(540, 600));
    const windows = Object.freeze([later, earlier]);
    const candidates = Object.freeze([675, 555, 540, 540]);
    expect(
      filterCandidateSlotStartsByServiceFit(windows, candidates, 15, 0),
    ).toEqual([540, 555, 675]);
    expect(windows).toEqual([later, earlier]);
    expect(candidates).toEqual([675, 555, 540, 540]);
    expect(later).toEqual(interval(660, 720));
    expect(earlier).toEqual(interval(540, 600));
  });
});
