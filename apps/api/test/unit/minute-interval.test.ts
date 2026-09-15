import { describe, expect, it } from "vitest";
import {
  isMinuteInterval,
  normalizeMinuteIntervals,
} from "../../src/modules/availability/minute-interval.js";

describe("minute intervals", () => {
  it.each([
    [{ startMinute: 540, endMinute: 720 }, true],
    [{ startMinute: 0, endMinute: 60 }, true],
    [{ startMinute: 1380, endMinute: 1440 }, true],
    [{ startMinute: 0.5, endMinute: 60 }, false],
    [{ startMinute: 0, endMinute: 60.5 }, false],
    [{ startMinute: -1, endMinute: 60 }, false],
    [{ startMinute: 1440, endMinute: 1441 }, false],
    [{ startMinute: 0, endMinute: 0 }, false],
    [{ startMinute: 0, endMinute: 1441 }, false],
    [{ startMinute: 60, endMinute: 60 }, false],
    [{ startMinute: 61, endMinute: 60 }, false],
  ] as const)("validates %j as %s", (interval, valid) => {
    expect(isMinuteInterval(interval)).toBe(valid);
  });

  it("normalizes unsorted adjacent intervals without mutating inputs", () => {
    const later = { startMinute: 720, endMinute: 1020 };
    const earlier = { startMinute: 540, endMinute: 720 };
    const input = [later, earlier];
    const normalized = normalizeMinuteIntervals(input);
    expect(normalized).toEqual([earlier, later]);
    expect(input).toEqual([later, earlier]);
    expect(normalized?.[0]).not.toBe(earlier);
    expect(normalized?.[1]).not.toBe(later);
    expect(earlier).toEqual({ startMinute: 540, endMinute: 720 });
    expect(later).toEqual({ startMinute: 720, endMinute: 1020 });
  });

  it.each([
    [
      { startMinute: 540, endMinute: 780 },
      { startMinute: 720, endMinute: 900 },
    ],
    [
      { startMinute: 540, endMinute: 780 },
      { startMinute: 540, endMinute: 780 },
    ],
  ])("rejects overlapping intervals", (...intervals) => {
    expect(normalizeMinuteIntervals(intervals)).toBeNull();
  });
});
