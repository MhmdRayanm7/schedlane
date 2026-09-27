import { describe, expect, it } from "vitest";
import {
  assertSafeDevelopmentEnvironment,
  DevEnvironmentSafetyError,
} from "../../../src/development/safety.js";

describe("development environment safety assertion", () => {
  const validDevUrl =
    "postgresql://schedlane:schedlane@localhost:5432/schedlane";

  it("accepts valid development environment on localhost", () => {
    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "development",
        databaseUrl: validDevUrl,
      }),
    ).not.toThrow();
  });

  it("accepts valid development environment on 127.0.0.1 and ::1", () => {
    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "development",
        databaseUrl:
          "postgresql://schedlane:schedlane@127.0.0.1:5432/schedlane",
      }),
    ).not.toThrow();

    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "development",
        databaseUrl: "postgresql://schedlane:schedlane@[::1]:5432/schedlane",
      }),
    ).not.toThrow();
  });

  it("rejects NODE_ENV=production", () => {
    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "production",
        databaseUrl: validDevUrl,
      }),
    ).toThrowError(DevEnvironmentSafetyError);
  });

  it("rejects NODE_ENV=test", () => {
    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "test",
        databaseUrl: validDevUrl,
      }),
    ).toThrowError(DevEnvironmentSafetyError);
  });

  it("rejects remote DATABASE_URL hosts", () => {
    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "development",
        databaseUrl:
          "postgresql://schedlane:schedlane@db.production.schedlane.internal:5432/schedlane",
      }),
    ).toThrowError(DevEnvironmentSafetyError);

    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "development",
        databaseUrl: "postgresql://user:pass@192.168.1.100:5432/schedlane",
      }),
    ).toThrowError(DevEnvironmentSafetyError);
  });

  it("rejects databases other than schedlane", () => {
    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "development",
        databaseUrl:
          "postgresql://schedlane:schedlane@localhost:5432/prod_database",
      }),
    ).toThrowError(DevEnvironmentSafetyError);
  });

  it("rejects missing or invalid DATABASE_URL", () => {
    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "development",
        databaseUrl: "",
      }),
    ).toThrowError(DevEnvironmentSafetyError);

    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "development",
        databaseUrl: "not-a-valid-url",
      }),
    ).toThrowError(DevEnvironmentSafetyError);

    expect(() =>
      assertSafeDevelopmentEnvironment({
        nodeEnv: "development",
        databaseUrl: "http://localhost:5432/schedlane",
      }),
    ).toThrowError(DevEnvironmentSafetyError);
  });
});
