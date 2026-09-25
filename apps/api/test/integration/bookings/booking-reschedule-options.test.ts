import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import type { BookingStatus, MembershipRole } from "../../../src/db-types.js";
import { localBookingStartToUtc } from "../../../src/modules/bookings/domain/time.js";
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

const now = new Date("2026-10-05T05:00:00.000Z");
const date = "2026-10-05";
const app = Fastify();
await app.register(bookingRoutes, { now: () => now });
afterAll(() => app.close());

async function fixture({
  role = "owner",
  status = "confirmed",
  sourceLinked = role === "staff",
}: {
  role?: MembershipRole;
  status?: BookingStatus;
  sourceLinked?: boolean;
} = {}) {
  const actor = await createTestUser();
  const organization = await createTestOrganization({
    minBookingNoticeMinutes: 10_000,
    maxBookingHorizonDays: 0,
    publicBookingPaused: true,
  });
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role,
  });
  const source = await createTestResource({
    organizationId: organization.id,
    userId: sourceLinked ? actor.id : null,
    name: "Alpha source",
  });
  const target = await createTestResource({
    organizationId: organization.id,
    name: "Beta target",
  });
  const inactive = await createTestResource({
    organizationId: organization.id,
    name: "Hidden inactive",
    deactivatedAt: now,
  });
  const service = await createTestService({
    organizationId: organization.id,
    durationMinutes: 60,
    bufferAfterMinutes: 20,
  });
  const booking = await createTestBooking({
    organizationId: organization.id,
    resourceId: source.id,
    serviceId: service.id,
    publicReference: `OPTIONS-${randomUUID()}`,
    status,
    startAt: new Date("2026-10-05T06:00:00.000Z"),
    durationMinutes: 30,
    bufferAfterMinutes: 10,
    cancelledAt: status === "cancelled" ? now : null,
    cancelledByUserId: status === "cancelled" ? actor.id : null,
  });
  await db
    .insertInto("organization_weekly_hours")
    .values({
      organization_id: organization.id,
      weekday: 1,
      start_minute: 420,
      end_minute: 720,
    })
    .execute();
  await db
    .insertInto("resource_service")
    .values(
      [source, target, inactive].map((resource) => ({
        organization_id: organization.id,
        resource_id: resource.id,
        service_id: service.id,
      })),
    )
    .execute();

  const get = (
    options: {
      userId?: string;
      organizationId?: string;
      bookingId?: string;
      query?: string;
    } = {},
  ) =>
    app.inject({
      method: "GET",
      url: `/api/organizations/${options.organizationId ?? organization.id}/bookings/${options.bookingId ?? booking.id}/reschedule-options?${options.query ?? `date=${date}`}`,
      headers: { "x-test-user": options.userId ?? actor.id },
    });
  return {
    actor,
    organization,
    source,
    target,
    inactive,
    service,
    booking,
    get,
  };
}

function expectError(
  response: { statusCode: number; json: () => unknown },
  statusCode: number,
  code: string,
) {
  expect(response.statusCode).toBe(statusCode);
  expect(response.json()).toMatchObject({
    code,
    message: expect.any(String),
    requestId: expect.any(String),
  });
}

describe("Booking reschedule options HTTP", () => {
  it("returns sorted active assigned Resources and prefers the current Resource", async () => {
    const f = await fixture();
    const response = await f.get();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      timezone: "Asia/Jerusalem",
      bookingId: f.booking.id,
      serviceId: f.service.id,
      durationMinutes: 30,
      bufferAfterMinutes: 10,
      date,
      selectedResourceId: f.source.id,
      resources: [
        { id: f.source.id, name: "Alpha source" },
        { id: f.target.id, name: "Beta target" },
      ],
    });
  });

  it("limits Staff to allowed Resources and protects the source Booking", async () => {
    const allowed = await fixture({ role: "staff" });
    expect((await allowed.get()).json()).toMatchObject({
      selectedResourceId: allowed.source.id,
      resources: [{ id: allowed.source.id, name: "Alpha source" }],
    });
    expectError(
      await allowed.get({
        query: `date=${date}&resourceId=${allowed.target.id}`,
      }),
      403,
      "INSUFFICIENT_ROLE",
    );

    const denied = await fixture({ role: "staff", sourceLinked: false });
    expectError(await denied.get(), 403, "INSUFFICIENT_ROLE");
  });

  it("does not leak another tenant's Booking", async () => {
    const f = await fixture();
    const other = await fixture();
    expectError(
      await f.get({ bookingId: other.booking.id }),
      404,
      "BOOKING_NOT_FOUND",
    );
    expectError(
      await f.get({ userId: randomUUID() }),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  });

  it.each(["cancelled", "no_show"] as const)(
    "rejects a %s Booking",
    async (status) => {
      const f = await fixture({ status });
      expectError(await f.get(), 409, "INVALID_BOOKING_STATUS");
    },
  );

  it("excludes the current Booking from occupancy", async () => {
    const f = await fixture();
    const body = (await f.get()).json<{ starts: number[] }>();
    expect(body.starts).toContain(540);
  });

  it("removes conflicts from confirmed Bookings but ignores cancelled and no-show occupancy", async () => {
    const f = await fixture();
    for (const [status, minute] of [
      ["confirmed", 600],
      ["cancelled", 630],
      ["no_show", 660],
    ] as const) {
      await createTestBooking({
        organizationId: f.organization.id,
        resourceId: f.target.id,
        serviceId: f.service.id,
        publicReference: `OCCUPANCY-${randomUUID()}`,
        status,
        startAt: localBookingStartToUtc(date, minute) as Date,
        durationMinutes: 30,
        bufferAfterMinutes: 0,
        cancelledAt: status === "cancelled" ? now : null,
        cancelledByUserId: status === "cancelled" ? f.actor.id : null,
      });
    }
    const response = await f.get({
      query: `date=${date}&resourceId=${f.target.id}`,
    });
    const { starts } = response.json<{ starts: number[] }>();
    expect(starts).not.toContain(600);
    expect(starts).toContain(630);
    expect(starts).toContain(660);
  });

  it("uses Booking duration and buffer snapshots after Service timing changes", async () => {
    const f = await fixture();
    const response = await f.get({
      query: `date=${date}&resourceId=${f.target.id}`,
    });
    expect(response.json()).toMatchObject({
      durationMinutes: 30,
      bufferAfterMinutes: 10,
      starts: expect.arrayContaining([645, 660, 675]),
    });
  });

  it("omits inactive Resources and maps explicit invalid targets", async () => {
    const f = await fixture();
    expect(
      (await f.get()).json<{ resources: Array<{ id: string }> }>().resources,
    ).not.toContainEqual(expect.objectContaining({ id: f.inactive.id }));
    expectError(
      await f.get({ query: `date=${date}&resourceId=${f.inactive.id}` }),
      409,
      "RESOURCE_INACTIVE",
    );
  });

  it("validates dates after scoped access and omits today's past starts", async () => {
    const f = await fixture();
    expectError(await f.get({ query: "date=2026-02-30" }), 400, "INVALID_DATE");
    const { starts } = (await f.get()).json<{ starts: number[] }>();
    expect(starts.every((start) => start >= 480)).toBe(true);
  });

  it("does not apply public pause, notice, or booking horizon policy", async () => {
    const f = await fixture();
    const response = await f.get({ query: "date=2026-10-12" });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ starts: number[] }>().starts.length).toBeGreaterThan(
      0,
    );
  });
});
