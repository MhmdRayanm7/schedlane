import { describe, expect, it } from "vitest";
import { assertApiConfig } from "../../src/config-validation.js";

const developmentConfig = {
  NODE_ENV: "development" as const,
  EMAIL_PROVIDER: "console" as const,
  BETTER_AUTH_URL: "http://localhost:3000",
  WEB_ORIGIN: "http://localhost:5173",
};

describe("API configuration invariants", () => {
  it("keeps console email available in development", () => {
    expect(() => assertApiConfig(developmentConfig)).not.toThrow();
  });

  it("fails closed when production email is configured for console", () => {
    expect(() =>
      assertApiConfig({ ...developmentConfig, NODE_ENV: "production" }),
    ).toThrow("Production requires EMAIL_PROVIDER=resend");
  });

  it("requires Resend credentials and valid customer-facing URLs", () => {
    const production = {
      ...developmentConfig,
      NODE_ENV: "production" as const,
      EMAIL_PROVIDER: "resend" as const,
    };
    expect(() => assertApiConfig(production)).toThrow("RESEND_API_KEY");
    expect(() =>
      assertApiConfig({
        ...production,
        RESEND_API_KEY: "test-key",
        EMAIL_FROM: "Schedlane <test@example.com>",
        WEB_ORIGIN: "not-a-url",
      }),
    ).toThrow("WEB_ORIGIN");
  });
});
