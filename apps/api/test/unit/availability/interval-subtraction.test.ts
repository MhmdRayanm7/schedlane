import { describe, expect, it } from "vitest";
import { subtractIntervals } from "../../../src/modules/availability/domain/interval-subtraction.js";

const interval = (startMinute: number, endMinute: number) => ({
  startMinute,
  endMinute,
});
type Interval = ReturnType<typeof interval>;
const baseline = [interval(540, 1020)];

describe("half-open interval subtraction", () => {
  it.each<[string, Interval[], Interval[], Interval[]]>([
    ["no blocks", baseline, [], baseline],
    ["empty working schedule", [], [interval(600, 660)], []],
    ["both empty", [], [], []],
    [
      "middle split",
      baseline,
      [interval(780, 840)],
      [interval(540, 780), interval(840, 1020)],
    ],
    ["leading overlap", baseline, [interval(480, 600)], [interval(600, 1020)]],
    ["trailing overlap", baseline, [interval(960, 1080)], [interval(540, 960)]],
    ["full coverage", baseline, [interval(480, 1080)], []],
    ["exact coverage", baseline, baseline, []],
    ["block before", baseline, [interval(420, 480)], baseline],
    ["block after", baseline, [interval(1080, 1140)], baseline],
    ["touching start", baseline, [interval(480, 540)], baseline],
    ["touching end", baseline, [interval(1020, 1080)], baseline],
    [
      "multiple blocks",
      baseline,
      [interval(600, 660), interval(780, 840), interval(900, 960)],
      [
        interval(540, 600),
        interval(660, 780),
        interval(840, 900),
        interval(960, 1020),
      ],
    ],
    [
      "block spans working intervals and gap",
      [interval(540, 720), interval(780, 1020)],
      [interval(660, 840)],
      [interval(540, 660), interval(840, 1020)],
    ],
    [
      "working intervals handled independently",
      [interval(540, 720), interval(780, 1020)],
      [interval(600, 660), interval(840, 900)],
      [
        interval(540, 600),
        interval(660, 720),
        interval(780, 840),
        interval(900, 1020),
      ],
    ],
    [
      "unsorted working intervals and blocks",
      [interval(780, 1020), interval(540, 720)],
      [interval(900, 960), interval(600, 660), interval(840, 900)],
      [
        interval(540, 600),
        interval(660, 720),
        interval(780, 840),
        interval(960, 1020),
      ],
    ],
    [
      "overlapping blocks",
      baseline,
      [interval(720, 900), interval(600, 780)],
      [interval(540, 600), interval(900, 1020)],
    ],
    [
      "contained block does not move cursor backwards",
      baseline,
      [interval(600, 900), interval(660, 720)],
      [interval(540, 600), interval(900, 1020)],
    ],
    [
      "duplicate blocks",
      baseline,
      [interval(600, 660), interval(600, 660)],
      [interval(540, 600), interval(660, 1020)],
    ],
    [
      "adjacent blocks leave no zero-length window",
      baseline,
      [interval(540, 720), interval(720, 1020)],
      [],
    ],
    [
      "block occupies only the non-working gap",
      [interval(540, 720), interval(780, 1020)],
      [interval(720, 780)],
      [interval(540, 720), interval(780, 1020)],
    ],
    [
      "adjacent working intervals remain separate",
      [interval(540, 720), interval(720, 1020)],
      [],
      [interval(540, 720), interval(720, 1020)],
    ],
    [
      "subtraction preserves adjacent working boundaries",
      [interval(540, 720), interval(720, 1020)],
      [interval(900, 960)],
      [interval(540, 720), interval(720, 900), interval(960, 1020)],
    ],
    [
      "midnight bounds",
      [interval(0, 1440)],
      [interval(0, 60), interval(1380, 1440)],
      [interval(60, 1380)],
    ],
  ])("%s", (_name, working, blocked, expected) => {
    const result = subtractIntervals(working, blocked);
    expect(result).toEqual(expected);
    expect(result.every((value) => value.startMinute < value.endMinute)).toBe(
      true,
    );
  });

  it("copies working intervals even without blocks", () => {
    const working = [interval(540, 720), interval(720, 1020)];
    const result = subtractIntervals(working, []);
    expect(result).toEqual(working);
    expect(result).not.toBe(working);
    for (const [index, value] of result.entries()) {
      expect(value).not.toBe(working[index]);
      value.startMinute = 0;
    }
    expect(working).toEqual([interval(540, 720), interval(720, 1020)]);
  });

  it("does not mutate either input array or its interval objects", () => {
    const working = Object.freeze([
      Object.freeze(interval(780, 1020)),
      Object.freeze(interval(540, 720)),
    ]);
    const blocked = Object.freeze([
      Object.freeze(interval(840, 900)),
      Object.freeze(interval(600, 660)),
    ]);
    const result = subtractIntervals(working, blocked);
    expect(result).toEqual([
      interval(540, 600),
      interval(660, 720),
      interval(780, 840),
      interval(900, 1020),
    ]);
    for (const value of result) {
      value.startMinute = 0;
      value.endMinute = 1440;
    }
    expect(working).toEqual([interval(780, 1020), interval(540, 720)]);
    expect(blocked).toEqual([interval(840, 900), interval(600, 660)]);
  });
});
