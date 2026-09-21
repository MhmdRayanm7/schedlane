import { describe, expect, it } from "vitest";
import {
  normalizeGuestEmail,
  normalizeGuestName,
  normalizeIsraeliGuestPhone,
  normalizeOptionalIsraeliGuestPhone,
} from "../../../src/modules/bookings/domain/guest-contact.js";

describe("Booking guest contact normalization", () => {
  it.each([
    "050-123-4567",
    "050 123 4567",
    "0501234567",
    "+972501234567",
    "+972 50 123 4567",
    "972501234567",
    "00972501234567",
  ])("normalizes Israeli mobile form %s to E.164", (input) => {
    expect(normalizeIsraeliGuestPhone(input)).toEqual({
      ok: true,
      guestPhone: "+972501234567",
    });
  });

  it("normalizes a valid Israeli landline through numbering metadata", () => {
    expect(normalizeIsraeliGuestPhone("02-531-0747")).toEqual({
      ok: true,
      guestPhone: "+97225310747",
    });
  });

  it.each(["", "   ", "not a phone", "05012", "0891234567", "+12025550123"])(
    "rejects invalid or foreign phone %j",
    (input) => {
      expect(normalizeIsraeliGuestPhone(input)).toEqual({
        ok: false,
        reason: "invalid_guest_phone",
      });
    },
  );

  it("normalizes optional phones, names, and emails without changing their contract", () => {
    expect(normalizeOptionalIsraeliGuestPhone(undefined)).toEqual({
      ok: true,
      guestPhone: null,
    });
    expect(normalizeOptionalIsraeliGuestPhone(null)).toEqual({
      ok: true,
      guestPhone: null,
    });
    expect(normalizeOptionalIsraeliGuestPhone("   ")).toEqual({
      ok: true,
      guestPhone: null,
    });
    expect(normalizeGuestName("  Guest Name  ")).toEqual({
      ok: true,
      guestName: "Guest Name",
    });
    expect(normalizeGuestName("   ")).toEqual({
      ok: false,
      reason: "invalid_guest_name",
    });
    expect(normalizeGuestEmail(undefined)).toBeNull();
    expect(normalizeGuestEmail(null)).toBeNull();
    expect(normalizeGuestEmail("   ")).toBeNull();
    expect(normalizeGuestEmail("  Guest@Example.test  ")).toBe(
      "Guest@Example.test",
    );
  });
});
