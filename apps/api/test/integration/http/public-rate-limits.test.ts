import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { config } from "../../../src/config.js";
import { rateLimitPluginOptions } from "../../../src/http/rate-limits.js";
import { publicAvailabilityRoutes } from "../../../src/modules/availability/http/public-routes.js";
import { publicBookingRoutes } from "../../../src/modules/bookings/http/public-routes.js";

const app = Fastify({ logger: false });
await app.register(rateLimit, rateLimitPluginOptions);
await app.register(publicAvailabilityRoutes);
await app.register(publicBookingRoutes);
app.get("/api/admin-probe", async () => ({ ok: true }));

afterAll(() => app.close());

describe("targeted public rate limits", () => {
  it("limits anonymous public reads with a stable safe response", async () => {
    for (let count = 0; count < config.PUBLIC_READ_RATE_LIMIT_MAX; count += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/api/public/organizations/not-found/booking-context",
        remoteAddress: "198.51.100.10",
      });
      expect(response.statusCode).toBe(404);
    }

    const limited = await app.inject({
      method: "GET",
      url: "/api/public/organizations/not-found/booking-context",
      remoteAddress: "198.51.100.10",
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      code: "RATE_LIMITED",
      message: "Too many requests. Please wait a moment and try again.",
      requestId: expect.any(String),
    });
  });

  it("limits anonymous booking mutations independently", async () => {
    const payload = {
      resourceId: "00000000-0000-4000-8000-000000000001",
      serviceId: "00000000-0000-4000-8000-000000000002",
      date: "2026-10-10",
      startMinute: 600,
      guestName: "Guest",
      guestPhone: "0501234567",
    };
    for (
      let count = 0;
      count < config.PUBLIC_WRITE_RATE_LIMIT_MAX;
      count += 1
    ) {
      const response = await app.inject({
        method: "POST",
        url: "/api/public/organizations/not-found/bookings",
        payload,
        remoteAddress: "198.51.100.20",
      });
      expect(response.statusCode).toBe(404);
    }

    const limited = await app.inject({
      method: "POST",
      url: "/api/public/organizations/not-found/bookings",
      payload,
      remoteAddress: "198.51.100.20",
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("does not globally throttle authenticated application routes", async () => {
    for (let count = 0; count < 130; count += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin-probe",
        remoteAddress: "198.51.100.30",
      });
      expect(response.statusCode).toBe(200);
    }
  });
});
