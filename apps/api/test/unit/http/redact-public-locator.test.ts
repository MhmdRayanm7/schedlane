import { describe, expect, it } from "vitest";
import { redactBookingShareTokenFromUrl } from "../../../src/http/redact-public-locator.js";

describe("public locator request logging", () => {
  it("redacts share query values while preserving route diagnostics", () => {
    expect(
      redactBookingShareTokenFromUrl(
        "/api/public/organizations/demo/availability?serviceId=s&share=opaque-token&date=2026-10-05",
      ),
    ).toBe(
      "/api/public/organizations/demo/availability?serviceId=s&share=[REDACTED]&date=2026-10-05",
    );
  });

  it("leaves requests without a share locator unchanged", () => {
    expect(
      redactBookingShareTokenFromUrl(
        "/api/public/organizations/demo/booking-context",
      ),
    ).toBe("/api/public/organizations/demo/booking-context");
  });
});
