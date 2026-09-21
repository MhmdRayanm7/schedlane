import { describe, expect, it } from "vitest";
import {
  type ExistingBookingOccupancy,
  filterSlotStartsByBookingOccupancy,
  type SlotOccupancyCandidate,
} from "../../../src/modules/availability/domain/booking-slot-occupancy.js";

const at = (time: string) => new Date(`2026-10-05T${time}:00.000Z`);
const candidate = (
  startMinute: number,
  start: string,
  occupiedUntil: string,
): SlotOccupancyCandidate => ({
  startMinute,
  startAt: at(start),
  occupiedUntilAt: at(occupiedUntil),
});
const booking = (
  start: string,
  occupiedUntil: string,
): ExistingBookingOccupancy => ({
  startAt: at(start),
  occupiedUntilAt: at(occupiedUntil),
});

describe("Booking slot occupancy", () => {
  it("keeps all candidates when there are no Bookings", () => {
    expect(
      filterSlotStartsByBookingOccupancy(
        [candidate(540, "06:00", "06:30"), candidate(570, "06:30", "07:00")],
        [],
      ),
    ).toEqual([540, 570]);
  });

  it.each([
    ["exact overlap", candidate(600, "07:00", "07:30")],
    [
      "starts before and overlaps into Booking",
      candidate(570, "06:30", "07:15"),
    ],
    ["starts during Booking", candidate(615, "07:15", "07:45")],
    ["fully contains Booking", candidate(570, "06:30", "08:00")],
    ["is fully contained by Booking", candidate(615, "07:15", "07:30")],
    ["overlaps by one minute", candidate(570, "06:30", "07:01")],
  ])("removes a candidate that %s", (_description, value) => {
    expect(
      filterSlotStartsByBookingOccupancy([value], [booking("07:00", "07:30")]),
    ).toEqual([]);
  });

  it.each([
    ["ends exactly when the Booking starts", candidate(570, "06:30", "07:00")],
    ["starts exactly when the Booking ends", candidate(630, "07:30", "08:00")],
  ])("keeps a candidate that %s", (_description, value) => {
    expect(
      filterSlotStartsByBookingOccupancy([value], [booking("07:00", "07:30")]),
    ).toEqual([value.startMinute]);
  });

  it("filters exact overlaps across multiple unsorted Bookings", () => {
    expect(
      filterSlotStartsByBookingOccupancy(
        [
          candidate(600, "07:00", "07:30"),
          candidate(540, "06:00", "06:30"),
          candidate(660, "08:00", "08:30"),
          candidate(570, "06:30", "07:00"),
        ],
        [booking("08:00", "08:30"), booking("06:15", "06:45")],
      ),
    ).toEqual([600]);
  });

  it("deduplicates and chronologically sorts unsorted candidates", () => {
    expect(
      filterSlotStartsByBookingOccupancy(
        [
          candidate(600, "07:00", "07:30"),
          candidate(540, "06:00", "06:30"),
          candidate(600, "07:00", "07:30"),
          candidate(570, "06:30", "07:00"),
        ],
        [],
      ),
    ).toEqual([540, 570, 600]);
  });

  it("returns an empty array for empty candidates", () => {
    expect(filterSlotStartsByBookingOccupancy([], [])).toEqual([]);
  });

  it.each([-1, 1440, 540.5])(
    "rejects invalid candidate startMinute %s",
    (startMinute) => {
      expect(
        filterSlotStartsByBookingOccupancy(
          [candidate(startMinute, "06:00", "06:30")],
          [],
        ),
      ).toBeNull();
    },
  );

  it.each([
    ["candidate start", { startAt: new Date("invalid") }],
    ["candidate end", { occupiedUntilAt: new Date("invalid") }],
  ])("rejects an invalid %s Date", (_description, override) => {
    expect(
      filterSlotStartsByBookingOccupancy(
        [{ ...candidate(540, "06:00", "06:30"), ...override }],
        [],
      ),
    ).toBeNull();
  });

  it("rejects an invalid Booking Date", () => {
    expect(
      filterSlotStartsByBookingOccupancy(
        [candidate(540, "06:00", "06:30")],
        [{ startAt: new Date("invalid"), occupiedUntilAt: at("07:00") }],
      ),
    ).toBeNull();
  });

  it.each([
    ["zero candidate interval", candidate(540, "06:00", "06:00"), []],
    ["negative candidate interval", candidate(540, "06:30", "06:00"), []],
    [
      "zero Booking interval",
      candidate(540, "06:00", "06:30"),
      [booking("07:00", "07:00")],
    ],
    [
      "negative Booking interval",
      candidate(540, "06:00", "06:30"),
      [booking("07:30", "07:00")],
    ],
  ])("rejects a %s", (_description, value, bookings) => {
    expect(filterSlotStartsByBookingOccupancy([value], bookings)).toBeNull();
  });

  it("does not mutate candidate, Booking, or array inputs", () => {
    const later = Object.freeze(candidate(600, "07:00", "07:30"));
    const earlier = Object.freeze(candidate(540, "06:00", "06:30"));
    const candidates = Object.freeze([later, earlier]);
    const occupancy = Object.freeze(booking("06:15", "06:45"));
    const bookings = Object.freeze([occupancy]);

    expect(filterSlotStartsByBookingOccupancy(candidates, bookings)).toEqual([
      600,
    ]);
    expect(candidates).toEqual([later, earlier]);
    expect(bookings).toEqual([occupancy]);
    expect(later).toEqual(candidate(600, "07:00", "07:30"));
    expect(earlier).toEqual(candidate(540, "06:00", "06:30"));
    expect(occupancy).toEqual(booking("06:15", "06:45"));
  });
});
