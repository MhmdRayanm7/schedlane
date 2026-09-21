import { describe, expect, it } from "vitest";
import { guestBookingManagementTestInternals } from "../../../src/modules/bookings/application/guest/write.js";

describe("guest Booking management transaction retries", () => {
  it("retries exact serialization failures up to three attempts", async () => {
    let attempts = 0;
    await expect(
      guestBookingManagementTestInternals.runWithSerializationRetry(
        async () => {
          attempts += 1;
          if (attempts < 3) throw { code: "40001" };
          return "ok";
        },
      ),
    ).resolves.toBe("ok");
    expect(attempts).toBe(3);
    expect(guestBookingManagementTestInternals.maxSerializationAttempts).toBe(
      3,
    );
  });

  it("does not retry unrelated failures or a fourth serialization attempt", async () => {
    let unrelatedAttempts = 0;
    await expect(
      guestBookingManagementTestInternals.runWithSerializationRetry(
        async () => {
          unrelatedAttempts += 1;
          throw new Error("failure");
        },
      ),
    ).rejects.toThrow("failure");
    expect(unrelatedAttempts).toBe(1);

    let serializationAttempts = 0;
    await expect(
      guestBookingManagementTestInternals.runWithSerializationRetry(
        async () => {
          serializationAttempts += 1;
          throw { code: "40001" };
        },
      ),
    ).rejects.toMatchObject({ code: "40001" });
    expect(serializationAttempts).toBe(3);
  });
});
