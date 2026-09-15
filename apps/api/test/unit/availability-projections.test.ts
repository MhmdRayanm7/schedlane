import { describe, expect, it } from "vitest";
import {
  projectOrganizationWeeklyHours,
  projectResourceWeeklyHours,
  projectScheduleOverride,
} from "../../src/modules/availability/availability-projections.js";

describe("Availability persistence projections", () => {
  it("projects seven Organization days without mutating rows", () => {
    const rows = [{ weekday: 2, start_minute: 720, end_minute: 840 }];
    const result = projectOrganizationWeeklyHours(rows);
    expect(result.days).toHaveLength(7);
    expect(result.days[1]?.intervals).toEqual([
      { startMinute: 720, endMinute: 840 },
    ]);
    expect(rows).toEqual([{ weekday: 2, start_minute: 720, end_minute: 840 }]);
  });

  it("projects Resource inherit, closed, and custom days", () => {
    const result = projectResourceWeeklyHours(
      "resource-id",
      [{ weekday: 2 }, { weekday: 3 }],
      [{ weekday: 3, start_minute: 600, end_minute: 900 }],
    );
    expect(result.days.slice(0, 3)).toEqual([
      { weekday: 1, mode: "inherit", intervals: [] },
      { weekday: 2, mode: "closed", intervals: [] },
      {
        weekday: 3,
        mode: "custom",
        intervals: [{ startMinute: 600, endMinute: 900 }],
      },
    ]);
  });

  it.each([
    [[], { mode: "inherit", intervals: [] }],
    [
      [{ start_minute: null, end_minute: null }],
      { mode: "closed", intervals: [] },
    ],
    [
      [{ start_minute: 540, end_minute: 720 }],
      {
        mode: "custom",
        intervals: [{ startMinute: 540, endMinute: 720 }],
      },
    ],
  ] as const)("projects left-join override rows", (rows, expected) => {
    expect(projectScheduleOverride(rows)).toEqual(expected);
  });
});
