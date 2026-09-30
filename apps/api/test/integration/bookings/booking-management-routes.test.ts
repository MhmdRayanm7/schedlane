import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import type { MembershipRole } from "../../../src/db-types.js";
import { bookingRoutes } from "../../../src/modules/bookings/http/management-routes.js";
import {
  addTestMembership,
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

vi.mock("../../../src/http/auth-guard.js", () => ({
  requireVerifiedUser: async (
    request: {
      headers: Record<string, string | undefined>;
      id: string;
      verifiedUser: unknown;
    },
    reply: {
      code: (status: number) => { send: (body: unknown) => unknown };
    },
  ) => {
    const userId = request.headers["x-test-user"];
    if (!userId)
      return reply.code(401).send({
        code: "UNAUTHORIZED",
        message: "Authentication required",
        requestId: request.id,
      });
    request.verifiedUser = { id: userId, email: "member@example.test" };
  },
}));

const app = Fastify();
await app.register(bookingRoutes);
afterAll(() => app.close());

const fromDate = "2026-10-05";
const toDate = "2026-10-07";

async function fixture(
  role: MembershipRole = "owner",
  { linked = role === "staff" }: { linked?: boolean } = {},
) {
  const actor = await createTestUser();
  const organization = await createTestOrganization();
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role,
  });
  const resource = await createTestResource({
    organizationId: organization.id,
    userId: linked ? actor.id : null,
    name: "Primary resource",
  });
  const otherResource = await createTestResource({
    organizationId: organization.id,
    name: "Other resource",
  });
  const service = await createTestService({
    organizationId: organization.id,
    name: "Management service",
  });

  const addBooking = async (
    resourceId = resource.id,
    startAt = new Date("2026-10-05T06:00:00.000Z"),
  ) =>
    createTestBooking({
      organizationId: organization.id,
      resourceId,
      serviceId: service.id,
      publicReference: `HTTP-${randomUUID()}`,
      startAt,
      durationMinutes: 30,
      bufferAfterMinutes: 0,
      guestName: "Route guest",
      guestPhone: "050-123-4567",
      guestEmail: "route@example.test",
      customerNote: "Route note",
    });

  const request = (
    query: Record<string, string> = { fromDate, toDate },
    userId: string | null = actor.id,
    organizationId = organization.id,
  ) =>
    app.inject({
      method: "GET",
      url: `/api/organizations/${organizationId}/bookings?${new URLSearchParams(query)}`,
      headers: userId ? { "x-test-user": userId } : {},
    });

  return {
    actor,
    organization,
    resource,
    otherResource,
    service,
    addBooking,
    request,
  };
}

describe("Booking management HTTP reads", () => {
  it.each(["owner", "manager"] as const)(
    "returns every Organization Resource to an authenticated %s",
    async (role) => {
      const f = await fixture(role);
      const first = await f.addBooking();
      const second = await f.addBooking(
        f.otherResource.id,
        new Date("2026-10-06T06:00:00.000Z"),
      );
      const response = await f.request();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        timezone: "Asia/Jerusalem",
        fromDate,
        toDate,
        bookings: [{ id: first.id }, { id: second.id }],
      });
    },
  );

  it("returns only the authenticated Staff member's linked Resource", async () => {
    const f = await fixture("staff");
    const own = await f.addBooking();
    await f.addBooking(
      f.otherResource.id,
      new Date("2026-10-05T07:00:00.000Z"),
    );
    const response = await f.request();
    expect(response.statusCode).toBe(200);
    expect(
      response.json().bookings.map((booking: { id: string }) => booking.id),
    ).toEqual([own.id]);
  });

  it("returns an empty collection for Staff without a linked Resource", async () => {
    const f = await fixture("staff", { linked: false });
    await f.addBooking();
    const response = await f.request();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ bookings: [] });
  });

  it("returns a generic Organization 404 to a non-member", async () => {
    const f = await fixture();
    const response = await f.request(undefined, randomUUID());
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "ORGANIZATION_NOT_FOUND",
      requestId: expect.any(String),
    });
  });

  it("requires verified authentication", async () => {
    const f = await fixture();
    const response = await f.request(undefined, null);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("supports one-day and multi-day queries", async () => {
    const f = await fixture();
    await f.addBooking();
    const oneDay = await f.request({ fromDate, toDate: fromDate });
    expect(oneDay.statusCode).toBe(200);
    expect(oneDay.json()).toMatchObject({
      fromDate,
      toDate: fromDate,
      bookings: [expect.any(Object)],
    });
    expect((await f.request()).statusCode).toBe(200);
  });

  it.each([
    { fromDate: "not-a-date", toDate },
    { fromDate, toDate: "2026-02-30" },
    { fromDate: "2026-10-08", toDate: "2026-10-07" },
  ])("maps invalid date range %j to a focused 400", async (query) => {
    const f = await fixture();
    const response = await f.request(query);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_BOOKING_DATE_RANGE",
      requestId: expect.any(String),
    });
  });

  it("rejects unknown query properties and invalid Organization UUIDs", async () => {
    const f = await fixture();
    const unknown = await f.request({ fromDate, toDate, extra: "true" });
    expect(unknown.statusCode).toBe(400);
    const invalidId = await f.request(undefined, f.actor.id, "not-a-uuid");
    expect(invalidId.statusCode).toBe(400);
  });

  it("strictly validates and forwards the Booking status filter", async () => {
    const f = await fixture();
    await f.addBooking();
    const confirmed = await f.request({
      fromDate,
      toDate,
      status: "confirmed",
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().bookings).toHaveLength(1);
    const invalid = await f.request({ fromDate, toDate, status: "pending" });
    expect(invalid.statusCode).toBe(400);
  });

  it("returns historical Bookings for deactivated entities without internal identifiers", async () => {
    const f = await fixture();
    const booking = await f.addBooking();
    await db
      .updateTable("resource")
      .set({ deactivated_at: new Date() })
      .where("id", "=", f.resource.id)
      .execute();
    await db
      .updateTable("service")
      .set({ deactivated_at: new Date() })
      .where("id", "=", f.service.id)
      .execute();
    const response = await f.request();
    expect(response.statusCode).toBe(200);
    expect(response.json().bookings).toEqual([
      expect.objectContaining({
        id: booking.id,
        guestPhone: "050-123-4567",
        guestEmail: "route@example.test",
      }),
    ]);
    const body = JSON.stringify(response.json());
    expect(body).not.toContain("cancelledByUserId");
    expect(body).not.toContain("userId");
  });
});

describe("Manual Booking HTTP workflow", () => {
  async function configureManualBooking(
    f: Awaited<ReturnType<typeof fixture>>,
  ) {
    await db
      .insertInto("organization_weekly_hours")
      .values({
        organization_id: f.organization.id,
        weekday: 1,
        start_minute: 540,
        end_minute: 660,
      })
      .execute();
    await db
      .insertInto("resource_service")
      .values({
        organization_id: f.organization.id,
        resource_id: f.resource.id,
        service_id: f.service.id,
      })
      .execute();
  }

  it("exposes context/options and creates without returning a capability", async () => {
    const f = await fixture();
    await configureManualBooking(f);
    const context = await app.inject({
      method: "GET",
      url: `/api/organizations/${f.organization.id}/bookings/manual-context`,
      headers: { "x-test-user": f.actor.id },
    });
    expect(context.statusCode).toBe(200);
    expect(context.json()).toMatchObject({
      role: "owner",
      resources: [
        { id: f.otherResource.id, services: [] },
        { id: f.resource.id, services: [{ id: f.service.id }] },
      ],
    });

    const options = await app.inject({
      method: "GET",
      url: `/api/organizations/${f.organization.id}/bookings/manual-options?${new URLSearchParams(
        { resourceId: f.resource.id, serviceId: f.service.id, date: fromDate },
      )}`,
      headers: { "x-test-user": f.actor.id },
    });
    expect(options.statusCode).toBe(200);
    expect(options.json()).toMatchObject({
      starts: expect.arrayContaining([540]),
    });

    const created = await app.inject({
      method: "POST",
      url: `/api/organizations/${f.organization.id}/bookings/manual`,
      headers: { "x-test-user": f.actor.id },
      payload: {
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date: fromDate,
        startMinute: 540,
        guestEmail: "manual@example.test",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      source: "manual",
      guestName: null,
      guestEmail: "manual@example.test",
      creator: { id: f.actor.id },
    });
    expect(JSON.stringify(created.json())).not.toContain("managementToken");
  });

  it("maps stale occupancy to SLOT_UNAVAILABLE", async () => {
    const f = await fixture();
    await configureManualBooking(f);
    const payload = {
      resourceId: f.resource.id,
      serviceId: f.service.id,
      date: fromDate,
      startMinute: 540,
    };
    const first = await app.inject({
      method: "POST",
      url: `/api/organizations/${f.organization.id}/bookings/manual`,
      headers: { "x-test-user": f.actor.id },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const conflict = await app.inject({
      method: "POST",
      url: `/api/organizations/${f.organization.id}/bookings/manual`,
      headers: { "x-test-user": f.actor.id },
      payload,
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});
