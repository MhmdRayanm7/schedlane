import { describe, expect, it } from "vitest";
import { calculateGuestCancellationPolicy } from "../../src/modules/bookings/guest-cancellation-policy.js";

const startAt = new Date("2026-10-05T12:00:00.000Z");

describe("guest cancellation policy", () => {
  it.each([
    [0, new Date(startAt.getTime() - 1), true],
    [0, startAt, true],
    [0, new Date(startAt.getTime() + 1), false],
    [60, new Date(startAt.getTime() - 60 * 60_000), true],
    [60, new Date(startAt.getTime() - 60 * 60_000 + 1), false],
    [1440, new Date(startAt.getTime() - 1440 * 60_000), true],
  ])("applies cutoff %i at exact instant %s", (cutoff, now, expected) => {
    const result = calculateGuestCancellationPolicy({
      status: "confirmed",
      startAt,
      cancellationCutoffMinutes: cutoff,
      now,
    });
    expect(result.canCancel).toBe(expected);
    expect(result.cancellationDeadlineAt).toEqual(
      new Date(startAt.getTime() - cutoff * 60_000),
    );
  });

  it.each(["cancelled", "no_show"] as const)(
    "rejects the %s state before the deadline",
    (status) => {
      expect(
        calculateGuestCancellationPolicy({
          status,
          startAt,
          cancellationCutoffMinutes: 0,
          now: new Date(startAt.getTime() - 1),
        }).canCancel,
      ).toBe(false);
    },
  );
});
