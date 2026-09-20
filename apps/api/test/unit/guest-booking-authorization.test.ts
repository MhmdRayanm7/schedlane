import { describe, expect, it } from "vitest";
import { generateGuestManagementToken } from "../../src/modules/bookings/booking-management-token.js";
import { parseGuestManagementBearer } from "../../src/modules/bookings/guest-booking-authorization.js";

describe("guest Booking bearer authorization", () => {
  it("accepts one case-insensitive Bearer scheme without changing the token", () => {
    const token = generateGuestManagementToken();
    expect(parseGuestManagementBearer(`Bearer ${token}`)).toBe(token);
    expect(parseGuestManagementBearer(`bEaReR ${token}`)).toBe(token);
  });

  it.each([
    undefined,
    "",
    "Basic abc",
    "Bearer",
    "Bearer ",
    "Bearer abc",
    `Bearer ${generateGuestManagementToken()} extra`,
    `Bearer  ${generateGuestManagementToken()}`,
  ])("rejects malformed credential %s", (authorization) => {
    expect(parseGuestManagementBearer(authorization)).toBeNull();
  });
});
