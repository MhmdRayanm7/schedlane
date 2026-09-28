import { describe, expect, it } from "vitest";
import {
  bookingReminderDueAt,
  eligibleBookingReminderDueAt,
} from "../../../src/modules/bookings/domain/reminder-policy.js";

describe("Booking reminder policy", () => {
  const startAt = new Date("2026-10-05T06:00:00.000Z");

  it("schedules exactly 24 hours before when the appointment is strictly more than 24 hours away", () => {
    expect(
      bookingReminderDueAt(startAt, new Date("2026-10-04T05:59:59.999Z")),
    ).toEqual(new Date("2026-10-04T06:00:00.000Z"));
  });

  it.each(["2026-10-04T06:00:00.000Z", "2026-10-04T06:00:00.001Z"])(
    "does not schedule at or inside the 24-hour boundary (%s)",
    (now) => {
      expect(bookingReminderDueAt(startAt, new Date(now))).toBeNull();
    },
  );

  it("requires a confirmed Booking with an email", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    expect(
      eligibleBookingReminderDueAt({
        status: "cancelled",
        guestEmail: "guest@example.test",
        startAt,
        now,
      }),
    ).toBeNull();
    expect(
      eligibleBookingReminderDueAt({
        status: "confirmed",
        guestEmail: null,
        startAt,
        now,
      }),
    ).toBeNull();
  });
});
