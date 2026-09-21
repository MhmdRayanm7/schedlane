import { describe, expect, it } from "vitest";
import { filterStartsByPublicBookingWindow } from "../../../src/modules/availability/domain/public-booking-window.js";

const base = {
  date: "2026-09-18",
  starts: [840, 855, 870],
  minBookingNoticeMinutes: 0,
  maxBookingHorizonDays: 60,
  now: new Date("2026-09-18T11:07:30.000Z"),
} as const;

describe("public Booking window", () => {
  it("with notice zero removes past starts and retains future starts", () => {
    expect(filterStartsByPublicBookingWindow(base)).toEqual({
      ok: true,
      starts: [855, 870],
    });
  });

  it.each([
    [10, [870]],
    [23, []],
    [30, []],
  ])("applies an exact %i-minute notice", (notice, starts) => {
    expect(
      filterStartsByPublicBookingWindow({
        ...base,
        minBookingNoticeMinutes: notice,
      }),
    ).toEqual({ ok: true, starts });
  });

  it("retains an exact notice threshold", () => {
    expect(
      filterStartsByPublicBookingWindow({
        ...base,
        now: new Date("2026-09-18T11:00:00.000Z"),
        starts: [870],
        minBookingNoticeMinutes: 30,
      }),
    ).toEqual({ ok: true, starts: [870] });
  });

  it("removes a start one millisecond before the notice threshold", () => {
    expect(
      filterStartsByPublicBookingWindow({
        ...base,
        now: new Date("2026-09-18T11:00:00.001Z"),
        starts: [870],
        minBookingNoticeMinutes: 30,
      }),
    ).toEqual({ ok: true, starts: [] });
  });

  it.each([
    ["2026-09-17", 60, "date_outside_booking_window"],
    ["2026-09-18", 0, null],
    ["2026-09-19", 0, "date_outside_booking_window"],
    ["2026-09-19", 1, null],
    ["2026-11-17", 60, null],
    ["2026-11-18", 60, "date_outside_booking_window"],
  ] as const)(
    "applies the calendar window for %s with horizon %i",
    (date, horizon, reason) => {
      const result = filterStartsByPublicBookingWindow({
        ...base,
        date,
        starts: [1439],
        maxBookingHorizonDays: horizon,
      });
      expect(result.ok ? null : result.reason).toBe(reason);
    },
  );

  it("allows the entire final horizon day after a late-afternoon now", () => {
    expect(
      filterStartsByPublicBookingWindow({
        ...base,
        date: "2026-11-17",
        starts: [30, 1380],
        now: new Date("2026-09-18T11:00:00.000Z"),
      }),
    ).toEqual({ ok: true, starts: [30, 1380] });
  });

  it.each([
    ["2026-10-01", "2026-09-30T09:00:00.000Z"],
    ["2027-01-01", "2026-12-31T10:00:00.000Z"],
  ])("crosses calendar boundaries for %s", (date, now) => {
    expect(
      filterStartsByPublicBookingWindow({
        ...base,
        date,
        starts: [720],
        now: new Date(now),
        maxBookingHorizonDays: 1,
      }),
    ).toEqual({ ok: true, starts: [720] });
  });

  it.each([
    [
      "2026-03-27",
      "2026-03-26T20:00:00.000Z",
      [60, 90, 120, 150, 180, 210],
      [60, 90, 180, 210],
    ],
    [
      "2026-10-25",
      "2026-10-24T20:00:00.000Z",
      [0, 30, 60, 90, 120, 150],
      [0, 30, 120, 150],
    ],
  ] as const)(
    "omits only non-unique local starts on DST date %s",
    (date, now, starts, expected) => {
      expect(
        filterStartsByPublicBookingWindow({
          ...base,
          date,
          starts,
          now: new Date(now),
          maxBookingHorizonDays: 1,
        }),
      ).toEqual({ ok: true, starts: expected });
    },
  );

  it("rejects an invalid local date", () => {
    expect(
      filterStartsByPublicBookingWindow({ ...base, date: "2026-02-30" }),
    ).toEqual({ ok: false, reason: "invalid_date" });
  });

  it.each([
    { minBookingNoticeMinutes: -1 },
    { minBookingNoticeMinutes: 1.5 },
    { minBookingNoticeMinutes: Number.MAX_VALUE },
    { maxBookingHorizonDays: -1 },
    { maxBookingHorizonDays: 1.5 },
    { maxBookingHorizonDays: Number.MAX_VALUE },
    { starts: [-1] },
    { starts: [1440] },
    { starts: [1.5] },
    { now: new Date("invalid") },
  ])("rejects invalid input $0", (override) => {
    expect(filterStartsByPublicBookingWindow({ ...base, ...override })).toEqual(
      { ok: false, reason: "invalid_public_booking_window" },
    );
  });

  it("sorts and deduplicates without mutating input", () => {
    const starts = Object.freeze([870, 855, 870]);
    expect(filterStartsByPublicBookingWindow({ ...base, starts })).toEqual({
      ok: true,
      starts: [855, 870],
    });
    expect(starts).toEqual([870, 855, 870]);
  });
});
