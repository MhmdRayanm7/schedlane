import { describe, expect, it } from "vitest";
import {
  generateGuestManagementToken,
  hashGuestManagementToken,
  isGuestManagementToken,
} from "../../src/modules/bookings/booking-management-token.js";

describe("guest Booking management tokens", () => {
  it("generates distinct 32-byte base64url credentials", () => {
    const first = generateGuestManagementToken();
    const second = generateGuestManagementToken();
    expect(first).toHaveLength(43);
    expect(isGuestManagementToken(first)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("hashes deterministically to lowercase SHA-256 hex", () => {
    const token = generateGuestManagementToken();
    const hash = hashGuestManagementToken(token);
    expect(hash).toBe(hashGuestManagementToken(token));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashGuestManagementToken(generateGuestManagementToken())).not.toBe(
      hash,
    );
  });

  it("rejects noncanonical token formats without trimming", () => {
    const token = generateGuestManagementToken();
    expect(isGuestManagementToken(` ${token}`)).toBe(false);
    expect(isGuestManagementToken(`${token} `)).toBe(false);
    expect(isGuestManagementToken(token.slice(1))).toBe(false);
    expect(isGuestManagementToken(`${token.slice(0, -1)}+`)).toBe(false);
  });
});
