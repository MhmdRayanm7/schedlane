import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { registerSafeErrorHandlers } from "../../../src/http/error-handlers.js";
import { registerHealthRoutes } from "../../../src/http/health-routes.js";

const app = Fastify({ logger: false });
registerSafeErrorHandlers(app);
app.get("/test/unexpected", async () => {
  throw new Error("database password and SQL details");
});
registerHealthRoutes(app, async () => undefined);

const unavailableApp = Fastify({ logger: false });
registerSafeErrorHandlers(unavailableApp);
registerHealthRoutes(unavailableApp, async () => {
  throw new Error("postgresql://secret-connection");
});

afterAll(async () => {
  await Promise.all([app.close(), unavailableApp.close()]);
});

describe("safe API fallbacks", () => {
  it("returns predictable JSON for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/missing" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "NOT_FOUND",
      message: "Route not found",
      requestId: expect.any(String),
    });
  });

  it("logs internally while keeping unexpected response details safe", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/test/unexpected",
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
      requestId: expect.any(String),
    });
    expect(response.body).not.toMatch(/password|SQL|stack/i);
  });
});

describe("health routes", () => {
  it("reports liveness and successful database readiness", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/health/live" })).json(),
    ).toEqual({ status: "ok" });
    expect(
      (await app.inject({ method: "GET", url: "/health/ready" })).json(),
    ).toEqual({ status: "ok" });
  });

  it("returns a safe 503 when the database is unavailable", async () => {
    const response = await unavailableApp.inject({
      method: "GET",
      url: "/health/ready",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable" });
    expect(response.body).not.toContain("secret-connection");
  });
});
