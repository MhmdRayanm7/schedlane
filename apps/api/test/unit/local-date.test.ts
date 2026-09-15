import { describe, expect, it } from "vitest";
import {
  isLocalDate,
  isoWeekdayFromLocalDate,
} from "../../src/modules/availability/local-date.js";

describe("local dates", () => {
  it.each([
    ["2026-10-05", true],
    ["2024-02-29", true],
    ["2023-02-29", false],
    ["2026-13-01", false],
    ["2026-04-31", false],
    ["05-10-2026", false],
    ["0000-01-01", false],
  ])("validates %s as %s", (date, valid) => {
    expect(isLocalDate(date)).toBe(valid);
  });

  it.each([
    ["2026-10-05", 1],
    ["2026-10-11", 7],
  ])("calculates the ISO weekday for %s", (date, weekday) => {
    expect(isoWeekdayFromLocalDate(date)).toBe(weekday);
  });

  it("rejects invalid dates without host-timezone interpretation", () => {
    expect(isoWeekdayFromLocalDate("2026-02-30")).toBeNull();
  });
});
