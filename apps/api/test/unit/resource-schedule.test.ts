import { describe, expect, it, vi } from "vitest";
import {
  type AvailabilityLayers,
  isoWeekdayFromLocalDate,
  resolveAvailabilityLayers,
  type ScheduleOverride,
} from "../../src/modules/availability/resource-schedule.js";

const baseline = [{ startMinute: 540, endMinute: 1020 }];
const inherit: ScheduleOverride = { mode: "inherit", intervals: [] };
const closed: ScheduleOverride = { mode: "closed", intervals: [] };
const custom = (startMinute: number, endMinute: number): ScheduleOverride => ({
  mode: "custom",
  intervals: [{ startMinute, endMinute }],
});
const defaults: AvailabilityLayers = {
  organizationWeekly: baseline,
  resourceWeekly: inherit,
  organizationDate: inherit,
  resourceDate: inherit,
};

describe("Availability layer precedence", () => {
  it.each<
    [
      string,
      Partial<AvailabilityLayers>,
      { startMinute: number; endMinute: number }[],
    ]
  >([
    ["Organization weekly only", {}, baseline],
    [
      "Resource weekly inherit preserves baseline",
      { resourceWeekly: inherit },
      baseline,
    ],
    [
      "Resource weekly closed replaces baseline",
      { resourceWeekly: closed },
      [],
    ],
    [
      "Resource weekly custom replaces baseline",
      { resourceWeekly: custom(600, 960) },
      [{ startMinute: 600, endMinute: 960 }],
    ],
    [
      "Organization date inherit preserves recurring result",
      { resourceWeekly: custom(600, 960), organizationDate: inherit },
      [{ startMinute: 600, endMinute: 960 }],
    ],
    ["Organization date closed is terminal", { organizationDate: closed }, []],
    [
      "Organization date custom replaces recurring",
      { resourceWeekly: custom(600, 960), organizationDate: custom(660, 900) },
      [{ startMinute: 660, endMinute: 900 }],
    ],
    [
      "Resource date inherit preserves Organization date",
      { organizationDate: custom(660, 900), resourceDate: inherit },
      [{ startMinute: 660, endMinute: 900 }],
    ],
    [
      "Resource date closed replaces previous layers",
      { organizationDate: custom(660, 900), resourceDate: closed },
      [],
    ],
    [
      "all four layers use the final custom",
      {
        resourceWeekly: custom(600, 960),
        organizationDate: custom(660, 900),
        resourceDate: custom(720, 1080),
      },
      [{ startMinute: 720, endMinute: 1080 }],
    ],
    [
      "Organization date closed beats Resource date custom",
      { organizationDate: closed, resourceDate: custom(0, 1440) },
      [],
    ],
    [
      "Resource weekly custom extends beyond Organization weekly",
      { resourceWeekly: custom(480, 1080) },
      [{ startMinute: 480, endMinute: 1080 }],
    ],
    [
      "Resource date custom extends beyond Organization date custom",
      { organizationDate: custom(600, 840), resourceDate: custom(540, 960) },
      [{ startMinute: 540, endMinute: 960 }],
    ],
    [
      "Resource weekly custom opens empty Organization weekly",
      { organizationWeekly: [], resourceWeekly: custom(600, 840) },
      [{ startMinute: 600, endMinute: 840 }],
    ],
    [
      "Resource date custom opens recurring closure",
      { resourceWeekly: closed, resourceDate: custom(600, 840) },
      [{ startMinute: 600, endMinute: 840 }],
    ],
    [
      "Organization date custom opens recurring closure",
      { resourceWeekly: closed, organizationDate: custom(660, 900) },
      [{ startMinute: 660, endMinute: 900 }],
    ],
    ["all inherited with empty baseline", { organizationWeekly: [] }, []],
  ])("%s", (_name, changes, expected) => {
    expect(resolveAvailabilityLayers({ ...defaults, ...changes })).toEqual(
      expected,
    );
  });

  it.each([
    "organizationWeekly",
    "resourceWeekly",
    "organizationDate",
    "resourceDate",
  ] as const)(
    "copies and sorts %s without mutating or merging intervals",
    (layer) => {
      const intervals = Object.freeze([
        Object.freeze({ startMinute: 720, endMinute: 900 }),
        Object.freeze({ startMinute: 540, endMinute: 720 }),
      ]);
      const layers = {
        ...defaults,
        [layer]:
          layer === "organizationWeekly"
            ? intervals
            : { mode: "custom", intervals },
      } as AvailabilityLayers;
      const result = resolveAvailabilityLayers(layers);
      expect(result).toEqual([
        { startMinute: 540, endMinute: 720 },
        { startMinute: 720, endMinute: 900 },
      ]);
      expect(result).not.toBe(intervals);
      expect(result[0]).not.toBe(intervals[1]);
      if (result[0]) result[0].startMinute = 0;
      expect(intervals[1]?.startMinute).toBe(540);
      expect(intervals[0]?.startMinute).toBe(720);
    },
  );
});

describe("ISO weekday from local date", () => {
  it.each([
    ["2026-10-05", 1],
    ["2026-10-06", 2],
    ["2026-10-07", 3],
    ["2026-10-08", 4],
    ["2026-10-09", 5],
    ["2026-10-10", 6],
    ["2026-10-11", 7],
    ["0001-01-01", 1],
    ["2000-02-29", 2],
    ["2026-03-27", 5],
    ["2026-10-25", 7],
  ] as const)(
    "%s has ISO weekday %s regardless of host timezone",
    (date, expected) => {
      try {
        for (const timezone of [
          "UTC",
          "Asia/Jerusalem",
          "America/Los_Angeles",
          "Pacific/Kiritimati",
        ]) {
          vi.stubEnv("TZ", timezone);
          expect(isoWeekdayFromLocalDate(date)).toBe(expected);
        }
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
  it.each([
    "2026-02-30",
    "2026-13-01",
    "1900-02-29",
    "0000-01-01",
    "2026-1-01",
    "2026-10-05\n",
    "2026-10-05T00:00:00Z",
  ])("rejects invalid date %j", (date) => {
    expect(isoWeekdayFromLocalDate(date)).toBeNull();
  });
});
