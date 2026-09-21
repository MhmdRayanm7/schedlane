import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import type { BookingStatus } from "../../../src/db-types.js";
import { availabilityRoutes } from "../../../src/modules/availability/http/management-routes.js";
import { publicAvailabilityRoutes } from "../../../src/modules/availability/http/public-routes.js";
import {
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
} from "../../helpers/factories.js";

const date = "2026-10-05";
const now = new Date("2026-10-05T05:07:30.000Z");
const app = Fastify();
await app.register(publicAvailabilityRoutes, { now: () => now });
await app.register(availabilityRoutes);
afterAll(() => app.close());

type FixtureOptions = {
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  suspendedAt?: Date | null;
  publicBookingPaused?: boolean;
  minBookingNoticeMinutes?: number;
  resourceDeactivatedAt?: Date | null;
  serviceDeactivatedAt?: Date | null;
};

async function fixture({
  publishedAt = new Date("2026-09-01T00:00:00.000Z"),
  archivedAt = null,
  suspendedAt = null,
  publicBookingPaused = false,
  minBookingNoticeMinutes = 0,
  resourceDeactivatedAt = null,
  serviceDeactivatedAt = null,
}: FixtureOptions = {}) {
  const organization = await createTestOrganization({
    publishedAt,
    archivedAt,
    suspendedAt,
    publicBookingPaused,
    minBookingNoticeMinutes,
  });
  const resource = await createTestResource({
    organizationId: organization.id,
    deactivatedAt: resourceDeactivatedAt,
  });
  const service = await createTestService({
    organizationId: organization.id,
    deactivatedAt: serviceDeactivatedAt,
  });
  const query = {
    resourceId: resource.id,
    serviceId: service.id,
    date,
  };
  return {
    organization,
    resource,
    service,
    query,
    request: (
      overrides: Partial<typeof query> = {},
      slug = organization.slug,
    ) => {
      const value = { ...query, ...overrides };
      const search = new URLSearchParams(value).toString();
      return app.inject({
        method: "GET",
        url: `/api/public/organizations/${encodeURIComponent(slug)}/availability?${search}`,
      });
    },
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function configure(
  f: Fixture,
  {
    weekday = 1,
    startMinute = 480,
    endMinute = 570,
    assign = true,
  }: {
    weekday?: number;
    startMinute?: number;
    endMinute?: number;
    assign?: boolean;
  } = {},
) {
  await db
    .insertInto("organization_weekly_hours")
    .values({
      organization_id: f.organization.id,
      weekday,
      start_minute: startMinute,
      end_minute: endMinute,
    })
    .execute();
  if (assign)
    await db
      .insertInto("resource_service")
      .values({
        organization_id: f.organization.id,
        resource_id: f.resource.id,
        service_id: f.service.id,
      })
      .execute();
}

async function addBooking(f: Fixture, status: BookingStatus) {
  await createTestBooking({
    organizationId: f.organization.id,
    resourceId: f.resource.id,
    serviceId: f.service.id,
    publicReference: randomUUID(),
    status,
    startAt: new Date("2026-10-05T06:00:00.000Z"),
    durationMinutes: 30,
    bufferAfterMinutes: 0,
    cancelledAt:
      status === "cancelled" ? new Date("2026-10-04T18:00:00.000Z") : null,
  });
}

const expectGenericNotFound = (response: {
  statusCode: number;
  json: () => unknown;
}) => {
  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({
    code: "PUBLIC_AVAILABILITY_NOT_FOUND",
    message: "Public availability not found",
    requestId: expect.any(String),
  });
};

describe("public Availability HTTP", () => {
  it("returns public starts without a cookie or session and no private data", async () => {
    const f = await fixture();
    await configure(f);
    const response = await f.request();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      timezone: "Asia/Jerusalem",
      resourceId: f.resource.id,
      serviceId: f.service.id,
      date,
      starts: [495, 510, 525, 540],
    });
  });

  it("keeps management Availability authenticated", async () => {
    const f = await fixture();
    const response = await app.inject({
      method: "GET",
      url: `/api/organizations/${f.organization.id}/availability/settings`,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("uses one generic 404 for unknown or publicly hidden Organizations", async () => {
    const visible = await fixture();
    expectGenericNotFound(await visible.request({}, "unknown-organization"));

    for (const options of [
      { publishedAt: null },
      { publishedAt: null, archivedAt: new Date() },
      { suspendedAt: new Date() },
      { publicBookingPaused: true },
    ]) {
      const hidden = await fixture(options);
      const response = await hidden.request();
      expectGenericNotFound(response);
      expect(JSON.stringify(response.json())).not.toMatch(
        /unpublished|archived|suspended|paused/i,
      );
    }
  });

  it("normalizes inactive and unassigned public pairings to the generic 404", async () => {
    for (const options of [
      { resourceDeactivatedAt: new Date() },
      { serviceDeactivatedAt: new Date() },
    ]) {
      const inactive = await fixture(options);
      await configure(inactive);
      expectGenericNotFound(await inactive.request());
    }
    const unassigned = await fixture();
    await configure(unassigned, { assign: false });
    expectGenericNotFound(await unassigned.request());
  });

  it.each(["resourceId", "serviceId"] as const)(
    "rejects an invalid %s UUID",
    async (field) => {
      const f = await fixture();
      const response = await f.request({ [field]: "not-a-uuid" });
      expect(response.statusCode).toBe(400);
    },
  );

  it("rejects unknown query fields", async () => {
    const f = await fixture();
    const response = await app.inject({
      method: "GET",
      url: `/api/public/organizations/${f.organization.slug}/availability?resourceId=${f.resource.id}&serviceId=${f.service.id}&date=${date}&extra=true`,
    });
    expect(response.statusCode).toBe(400);
  });

  it("maps invalid and out-of-window dates to focused 400 errors", async () => {
    const f = await fixture();
    await configure(f);
    const invalid = await f.request({ date: "2026-02-30" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "INVALID_DATE" });
    const past = await f.request({ date: "2026-10-04" });
    expect(past.statusCode).toBe(400);
    expect(past.json()).toMatchObject({
      code: "DATE_OUTSIDE_BOOKING_WINDOW",
    });
    const day61 = await f.request({ date: "2026-12-05" });
    expect(day61.statusCode).toBe(400);
    expect(day61.json()).toMatchObject({
      code: "DATE_OUTSIDE_BOOKING_WINDOW",
    });
  });

  it("returns the full final horizon calendar day", async () => {
    const f = await fixture();
    await configure(f, { weekday: 5, startMinute: 1080, endMinute: 1140 });
    const response = await f.request({ date: "2026-12-04" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ starts: [1080, 1095, 1110] });
  });

  it("filters near-term starts by the configured notice", async () => {
    const f = await fixture({ minBookingNoticeMinutes: 30 });
    await configure(f);
    const response = await f.request();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ starts: [525, 540] });
  });

  it("subtracts confirmed Bookings while ignoring cancelled and no_show rows", async () => {
    const f = await fixture();
    await configure(f);
    await addBooking(f, "cancelled");
    await addBooking(f, "no_show");
    expect((await f.request()).json()).toMatchObject({
      starts: [495, 510, 525, 540],
    });
    await addBooking(f, "confirmed");
    const response = await f.request();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ starts: [495, 510] });
  });

  it("composes Time Blocks and returns 200 for empty results", async () => {
    const f = await fixture();
    await configure(f);
    await db
      .insertInto("resource_time_block")
      .values({
        organization_id: f.organization.id,
        resource_id: f.resource.id,
        local_date: date,
        start_minute: 480,
        end_minute: 570,
      })
      .execute();
    const response = await f.request();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ starts: [] });
  });
});
