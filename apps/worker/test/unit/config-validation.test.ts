import { describe, expect, it } from "vitest";
import { assertWorkerConfig } from "../../src/config-validation.js";

const developmentConfig = {
  NODE_ENV: "development" as const,
  EMAIL_PROVIDER: "console" as const,
};
const productionConfig = {
  NODE_ENV: "production" as const,
  EMAIL_PROVIDER: "resend" as const,
  RESEND_API_KEY: "test-key",
  EMAIL_FROM: "Schedlane <test@example.com>",
  GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY:
    "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
  APP_BASE_URL: "https://app.example.com",
  GUEST_BOOKING_MANAGEMENT_URL: "https://app.example.com/booking/manage",
};

describe("Worker configuration invariants", () => {
  it("keeps flexible console configuration in development", () => {
    expect(() => assertWorkerConfig(developmentConfig)).not.toThrow();
  });

  it("requires Resend in production", () => {
    expect(() =>
      assertWorkerConfig({ ...developmentConfig, NODE_ENV: "production" }),
    ).toThrow("Production requires EMAIL_PROVIDER=resend");
  });

  it("accepts complete production email, token, and URL configuration", () => {
    expect(() => assertWorkerConfig(productionConfig)).not.toThrow();
  });

  it("rejects missing credentials, invalid keys, and invalid URLs", () => {
    expect(() =>
      assertWorkerConfig({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: productionConfig.EMAIL_FROM,
        GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY:
          productionConfig.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY,
        APP_BASE_URL: productionConfig.APP_BASE_URL,
        GUEST_BOOKING_MANAGEMENT_URL:
          productionConfig.GUEST_BOOKING_MANAGEMENT_URL,
      }),
    ).toThrow("RESEND_API_KEY");
    expect(() =>
      assertWorkerConfig({
        ...productionConfig,
        GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY: "not-a-key",
      }),
    ).toThrow("base64-encoded 32-byte key");
    expect(() =>
      assertWorkerConfig({ ...productionConfig, APP_BASE_URL: "ftp://bad" }),
    ).toThrow("APP_BASE_URL");
  });
});
