import { describe, expect, it, vi } from "vitest";
import { canCreateManualBookingForResource } from "../../src/modules/bookings/booking-policy.js";
import {
  BOOKING_PUBLIC_REFERENCE_ALPHABET,
  generateBookingPublicReference,
} from "../../src/modules/bookings/booking-public-reference.js";
import {
  type CreateManualBookingInput,
  manualBookingTestInternals,
} from "../../src/modules/bookings/booking-service.js";
import {
  calculateBookingTemporalSnapshot,
  localBookingStartToUtc,
} from "../../src/modules/bookings/booking-time.js";

const input: CreateManualBookingInput = {
  userId: "user-id",
  organizationId: "organization-id",
  resourceId: "resource-id",
  serviceId: "service-id",
  date: "2026-10-05",
  startMinute: 540,
  guestName: "Guest",
};

const stoppedResult = {
  ok: false as const,
  reason: "start_not_available" as const,
};

describe("Booking domain helpers", () => {
  it.each([
    ["owner", "another-user", true],
    ["manager", "another-user", true],
    ["staff", "user-id", true],
    ["staff", "another-user", false],
    ["staff", null, false],
  ] as const)(
    "applies %s manual Booking access to linked user %s",
    (role, resourceUserId, expected) => {
      expect(
        canCreateManualBookingForResource(
          { userId: input.userId, role },
          resourceUserId,
        ),
      ).toBe(expected);
    },
  );

  it("generates short, human-friendly, non-UUID public references", () => {
    const first = generateBookingPublicReference();
    const second = generateBookingPublicReference();
    const allowed = new RegExp(
      `^BK-[${BOOKING_PUBLIC_REFERENCE_ALPHABET}]{10}$`,
    );
    expect(first).toMatch(allowed);
    expect(first).toHaveLength(13);
    expect(second).toMatch(allowed);
    expect(second).not.toBe(first);
    expect(first).not.toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("converts an unambiguous Asia/Jerusalem wall time to UTC", () => {
    expect(localBookingStartToUtc("2026-10-05", 9 * 60)).toEqual(
      new Date("2026-10-05T06:00:00.000Z"),
    );
  });

  it("rejects a nonexistent Asia/Jerusalem spring-forward wall time", () => {
    expect(localBookingStartToUtc("2026-03-27", 2 * 60 + 30)).toBeNull();
  });

  it("rejects an ambiguous Asia/Jerusalem fall-back wall time", () => {
    expect(localBookingStartToUtc("2026-10-25", 1 * 60 + 30)).toBeNull();
  });

  it("calculates duration and buffer snapshots as absolute minutes", () => {
    expect(
      calculateBookingTemporalSnapshot(
        new Date("2026-10-05T06:00:00.000Z"),
        45,
        15,
      ),
    ).toEqual({
      serviceEndAt: new Date("2026-10-05T06:45:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T07:00:00.000Z"),
    });
  });
});

describe("Manual Booking transaction retries", () => {
  it("retries one 40001 with the same reference and then succeeds", async () => {
    const serializationFailure = { code: "40001" };
    const references: string[] = [];
    const executeTransactionAttempt = vi
      .fn()
      .mockImplementationOnce(async (_input, reference) => {
        references.push(reference);
        throw serializationFailure;
      })
      .mockImplementationOnce(async (_input, reference) => {
        references.push(reference);
        return stoppedResult;
      });

    await expect(
      manualBookingTestInternals.createManualBookingWithDependencies(input, {
        generatePublicReference: () => "BK-2222222222",
        executeTransactionAttempt,
      }),
    ).resolves.toEqual(stoppedResult);
    expect(references).toEqual(["BK-2222222222", "BK-2222222222"]);
  });

  it("stops after three total 40001 attempts", async () => {
    const serializationFailure = { code: "40001" };
    const executeTransactionAttempt = vi
      .fn()
      .mockRejectedValue(serializationFailure);
    await expect(
      manualBookingTestInternals.createManualBookingWithDependencies(input, {
        generatePublicReference: () => "BK-2222222222",
        executeTransactionAttempt,
      }),
    ).rejects.toBe(serializationFailure);
    expect(executeTransactionAttempt).toHaveBeenCalledTimes(3);
  });

  it("maps 23P01 without retrying", async () => {
    const executeTransactionAttempt = vi.fn().mockRejectedValue({
      code: "23P01",
      constraint: "booking_confirmed_resource_occupancy_excl",
    });
    await expect(
      manualBookingTestInternals.createManualBookingWithDependencies(input, {
        generatePublicReference: () => "BK-2222222222",
        executeTransactionAttempt,
      }),
    ).resolves.toEqual({ ok: false, reason: "booking_conflict" });
    expect(executeTransactionAttempt).toHaveBeenCalledOnce();
  });

  it("does not retry unrelated database errors", async () => {
    const unexpected = { code: "23503" };
    const executeTransactionAttempt = vi.fn().mockRejectedValue(unexpected);
    await expect(
      manualBookingTestInternals.createManualBookingWithDependencies(input, {
        generatePublicReference: () => "BK-2222222222",
        executeTransactionAttempt,
      }),
    ).rejects.toBe(unexpected);
    expect(executeTransactionAttempt).toHaveBeenCalledOnce();
  });

  it("restarts with a new reference only for its exact unique constraint", async () => {
    const references = ["BK-2222222222", "BK-3333333333"];
    const generatePublicReference = vi.fn(() => references.shift() ?? "");
    const executeTransactionAttempt = vi
      .fn()
      .mockRejectedValueOnce({
        code: "23505",
        constraint: "booking_public_reference_key",
      })
      .mockResolvedValueOnce(stoppedResult);
    await expect(
      manualBookingTestInternals.createManualBookingWithDependencies(input, {
        generatePublicReference,
        executeTransactionAttempt,
      }),
    ).resolves.toEqual(stoppedResult);
    expect(generatePublicReference).toHaveBeenCalledTimes(2);
    expect(executeTransactionAttempt.mock.calls.map((call) => call[1])).toEqual(
      ["BK-2222222222", "BK-3333333333"],
    );
  });

  it("does not retry a different 23505 constraint", async () => {
    const unexpected = { code: "23505", constraint: "another_constraint" };
    const executeTransactionAttempt = vi.fn().mockRejectedValue(unexpected);
    await expect(
      manualBookingTestInternals.createManualBookingWithDependencies(input, {
        generatePublicReference: () => "BK-2222222222",
        executeTransactionAttempt,
      }),
    ).rejects.toBe(unexpected);
    expect(executeTransactionAttempt).toHaveBeenCalledOnce();
  });

  it("stops after five public-reference collisions", async () => {
    const executeTransactionAttempt = vi.fn().mockRejectedValue({
      code: "23505",
      constraint: "booking_public_reference_key",
    });
    await expect(
      manualBookingTestInternals.createManualBookingWithDependencies(input, {
        generatePublicReference: () => "BK-2222222222",
        executeTransactionAttempt,
      }),
    ).rejects.toThrow("Could not allocate");
    expect(executeTransactionAttempt).toHaveBeenCalledTimes(5);
  });
});
