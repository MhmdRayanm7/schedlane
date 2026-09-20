import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import type { BookingStatus, MembershipRole } from "../../src/db-types.js";
import { resolveResourceServiceFreeSlotStartsForDate } from "../../src/modules/availability/resource-service-free-slot-resolver.js";
import { bookingRoutes } from "../../src/modules/bookings/booking-routes.js";
import {
  addTestMembership,
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../helpers/factories.js";

vi.mock("../../src/http/auth-guard.js", () => ({
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

const now = new Date("2026-10-05T07:00:00.000Z");
const app = Fastify();
await app.register(bookingRoutes, { now: () => now });
afterAll(() => app.close());

async function fixture({
  role = "owner",
  linked = role === "staff",
  status = "confirmed",
  bookingResource = "primary",
  startAt = new Date("2026-10-05T06:00:00.000Z"),
}: {
  role?: MembershipRole;
  linked?: boolean;
  status?: BookingStatus;
  bookingResource?: "primary" | "other";
  startAt?: Date;
} = {}) {
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
  });
  const otherResource = await createTestResource({
    organizationId: organization.id,
  });
  const service = await createTestService({
    organizationId: organization.id,
    durationMinutes: 30,
  });
  const booking = await createTestBooking({
    organizationId: organization.id,
    resourceId: bookingResource === "primary" ? resource.id : otherResource.id,
    serviceId: service.id,
    publicReference: `HTTP-LIFE-${randomUUID()}`,
    status,
    startAt,
    durationMinutes: 30,
    bufferAfterMinutes: 0,
    cancelledAt:
      status === "cancelled" ? new Date("2026-10-05T06:30:00.000Z") : null,
    cancelledByUserId: status === "cancelled" ? actor.id : null,
    cancellationReason: status === "cancelled" ? "Existing" : null,
  });

  const post = (
    action: "cancel" | "mark-no-show" | "revert-no-show",
    options: {
      payload?: Record<string, unknown>;
      userId?: string | null;
      organizationId?: string;
      bookingId?: string;
    } = {},
  ) =>
    app.inject({
      method: "POST",
      url: `/api/organizations/${options.organizationId ?? organization.id}/bookings/${options.bookingId ?? booking.id}/${action}`,
      headers:
        options.userId === null
          ? {}
          : { "x-test-user": options.userId ?? actor.id },
      ...(Object.hasOwn(options, "payload")
        ? { payload: options.payload }
        : {}),
    });

  return {
    actor,
    organization,
    resource,
    otherResource,
    service,
    booking,
    post,
  };
}

const expectError = (
  response: { statusCode: number; json: () => unknown },
  statusCode: number,
  code: string,
) => {
  expect(response.statusCode).toBe(statusCode);
  expect(response.json()).toMatchObject({
    code,
    requestId: expect.any(String),
  });
};

describe("Booking lifecycle management HTTP", () => {
  it.each(["owner", "manager"] as const)(
    "allows authenticated %s cancellation",
    async (role) => {
      const f = await fixture({ role });
      const response = await f.post("cancel");
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: f.booking.id,
        publicReference: f.booking.public_reference,
        status: "cancelled",
        cancelledAt: now.toISOString(),
        cancellationReason: null,
        updatedAt: now.toISOString(),
      });
    },
  );

  it("applies Staff own-Resource authorization", async () => {
    const own = await fixture({ role: "staff" });
    expect((await own.post("cancel", { payload: {} })).statusCode).toBe(200);
    const other = await fixture({
      role: "staff",
      bookingResource: "other",
    });
    expectError(
      await other.post("cancel", { payload: {} }),
      403,
      "INSUFFICIENT_ROLE",
    );
  });

  it("allows Staff to mark and revert no-show for their linked Resource", async () => {
    const f = await fixture({ role: "staff" });
    expect((await f.post("mark-no-show")).statusCode).toBe(200);
    expect((await f.post("revert-no-show")).statusCode).toBe(200);
  });

  it("requires verified authentication", async () => {
    const f = await fixture();
    expectError(await f.post("cancel", { userId: null }), 401, "UNAUTHORIZED");
  });

  it("preserves Organization and Booking anti-leak errors", async () => {
    const f = await fixture();
    expectError(
      await f.post("cancel", { userId: randomUUID() }),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
    expectError(
      await f.post("cancel", { bookingId: randomUUID() }),
      404,
      "BOOKING_NOT_FOUND",
    );
    const other = await fixture();
    expectError(
      await f.post("cancel", { bookingId: other.booking.id }),
      404,
      "BOOKING_NOT_FOUND",
    );
  });

  it.each([
    ["archived_at", "ORGANIZATION_ARCHIVED"],
    ["suspended_at", "ORGANIZATION_SUSPENDED"],
  ] as const)("maps %s write state", async (column, code) => {
    const f = await fixture();
    await db
      .updateTable("organization")
      .set({ [column]: new Date() })
      .where("id", "=", f.organization.id)
      .execute();
    expectError(await f.post("cancel"), 409, code);
  });

  it.each([
    [undefined, null],
    [null, null],
    ["  Management reason  ", "Management reason"],
  ] as const)("accepts cancellation reason %s", async (reason, expected) => {
    const f = await fixture();
    const response = await f.post("cancel", {
      payload: reason === undefined ? {} : { reason },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "cancelled",
      cancellationReason: expected,
    });
    expect(response.json()).not.toHaveProperty("cancelledByUserId");
    expect(
      await db
        .selectFrom("booking")
        .select("cancelled_by_user_id")
        .where("id", "=", f.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ cancelled_by_user_id: f.actor.id });
  });

  it("rejects unknown cancellation body fields and invalid params", async () => {
    const f = await fixture();
    expect(
      (await f.post("cancel", { payload: { extra: true } })).statusCode,
    ).toBe(400);
    expect(
      (await f.post("cancel", { organizationId: "invalid" })).statusCode,
    ).toBe(400);
    expect((await f.post("cancel", { bookingId: "invalid" })).statusCode).toBe(
      400,
    );
  });

  it("maps repeated cancellation to invalid status", async () => {
    const f = await fixture();
    expect((await f.post("cancel")).statusCode).toBe(200);
    expectError(await f.post("cancel"), 409, "INVALID_BOOKING_STATUS");
  });

  it("maps no-show timing and status errors", async () => {
    const future = await fixture({
      startAt: new Date("2026-10-05T08:00:00.000Z"),
    });
    expectError(await future.post("mark-no-show"), 409, "NO_SHOW_TOO_EARLY");
    const noShow = await fixture({ status: "no_show" });
    expectError(
      await noShow.post("mark-no-show"),
      409,
      "INVALID_BOOKING_STATUS",
    );
    const cancelled = await fixture({ status: "cancelled" });
    expectError(
      await cancelled.post("mark-no-show"),
      409,
      "INVALID_BOOKING_STATUS",
    );
  });

  it("marks no-show at the exact start and returns the lifecycle DTO", async () => {
    const f = await fixture({ startAt: now });
    const response = await f.post("mark-no-show");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: f.booking.id,
      publicReference: f.booking.public_reference,
      status: "no_show",
      cancelledAt: null,
      cancellationReason: null,
      updatedAt: now.toISOString(),
    });
  });

  it("reverts no-show and rejects confirmed or cancelled states", async () => {
    const noShow = await fixture({ status: "no_show" });
    expect(await noShow.post("revert-no-show")).toMatchObject({
      statusCode: 200,
    });
    const confirmed = await fixture();
    expectError(
      await confirmed.post("revert-no-show"),
      409,
      "INVALID_BOOKING_STATUS",
    );
    const cancelled = await fixture({ status: "cancelled" });
    expectError(
      await cancelled.post("revert-no-show"),
      409,
      "INVALID_BOOKING_STATUS",
    );
  });

  it("maps conflicting no-show restoration without changing either Booking", async () => {
    const f = await fixture({ status: "no_show" });
    const competing = await createTestBooking({
      organizationId: f.organization.id,
      resourceId: f.resource.id,
      serviceId: f.service.id,
      publicReference: `HTTP-CONFLICT-${randomUUID()}`,
      startAt: f.booking.start_at,
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });
    expectError(await f.post("revert-no-show"), 409, "BOOKING_CONFLICT");
    expect(
      await db
        .selectFrom("booking")
        .select(["id", "status"])
        .where("id", "in", [f.booking.id, competing.id])
        .orderBy("id", "asc")
        .execute(),
    ).toEqual(
      [
        { id: f.booking.id, status: "no_show" },
        { id: competing.id, status: "confirmed" },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it("releases and restores Availability through no-show routes", async () => {
    const f = await fixture();
    await db
      .insertInto("organization_weekly_hours")
      .values({
        organization_id: f.organization.id,
        weekday: 1,
        start_minute: 540,
        end_minute: 600,
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
    const starts = async () => {
      const result = await resolveResourceServiceFreeSlotStartsForDate({
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date: "2026-10-05",
      });
      if (!result.ok) throw new Error("Expected free slots");
      return result.slots.starts;
    };
    expect(await starts()).toEqual([570]);
    expect((await f.post("mark-no-show")).statusCode).toBe(200);
    expect(await starts()).toEqual([540, 555, 570]);
    expect((await f.post("revert-no-show")).statusCode).toBe(200);
    expect(await starts()).toEqual([570]);
  });
});
