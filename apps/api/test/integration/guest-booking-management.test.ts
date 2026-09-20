import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import type { BookingStatus } from "../../src/db-types.js";
import {
  cancelManagementBooking,
  markManagementBookingNoShow,
  revertManagementBookingNoShow,
} from "../../src/modules/bookings/booking-lifecycle-service.js";
import {
  generateGuestManagementToken,
  hashGuestManagementToken,
} from "../../src/modules/bookings/booking-management-token.js";
import { rescheduleManagementBooking } from "../../src/modules/bookings/booking-reschedule-service.js";
import {
  cancelGuestManagedBooking,
  getGuestManagedBooking,
} from "../../src/modules/bookings/guest-booking-management-service.js";
import { publicBookingRoutes } from "../../src/modules/bookings/public-booking-routes.js";
import {
  addTestMembership,
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../helpers/factories.js";

const startAt = new Date("2026-10-05T12:00:00.000Z");
const routeNow = new Date("2026-10-05T10:00:00.000Z");
const app = Fastify();
await app.register(publicBookingRoutes, { now: () => routeNow });
afterAll(() => app.close());

async function fixture({
  status = "confirmed",
  cancellationCutoffMinutes = 60,
}: {
  status?: BookingStatus;
  cancellationCutoffMinutes?: number;
} = {}) {
  const token = generateGuestManagementToken();
  const organization = await createTestOrganization({
    name: "Guest organization",
    cancellationCutoffMinutes: 1440,
  });
  const resource = await createTestResource({
    organizationId: organization.id,
    name: "Guest resource",
  });
  const service = await createTestService({
    organizationId: organization.id,
    name: "Guest service",
    durationMinutes: 30,
    priceAgorot: 9000,
  });
  const booking = await createTestBooking({
    organizationId: organization.id,
    resourceId: resource.id,
    serviceId: service.id,
    publicReference: `GUEST-${randomUUID()}`,
    status,
    startAt,
    durationMinutes: 45,
    bufferAfterMinutes: 15,
    priceAgorot: 5000,
    guestName: "Guest name",
    guestPhone: "050-123-4567",
    guestEmail: "guest@example.test",
    customerNote: "Guest note",
    cancelledAt: status === "cancelled" ? routeNow : null,
    cancellationReason: status === "cancelled" ? "Existing reason" : null,
    cancellationCutoffMinutes,
    guestManagementTokenHash: hashGuestManagementToken(token),
  });
  const request = (
    method: "GET" | "POST",
    suppliedToken: string | null = token,
    payload?: object,
  ) =>
    app.inject({
      method,
      url:
        method === "GET"
          ? "/api/public/bookings/manage"
          : "/api/public/bookings/manage/cancel",
      headers:
        suppliedToken === null
          ? {}
          : { authorization: `Bearer ${suppliedToken}` },
      ...(payload === undefined ? {} : { payload }),
    });
  return { token, organization, resource, service, booking, request };
}

function expectGuestNotFound(response: {
  statusCode: number;
  json: () => unknown;
}) {
  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({
    code: "GUEST_BOOKING_NOT_FOUND",
    requestId: expect.any(String),
  });
}

describe("guest Booking management", () => {
  it("uses one generic 404 for missing, malformed, and unknown credentials", async () => {
    const f = await fixture();
    expectGuestNotFound(await f.request("GET", null));
    for (const authorization of [
      "Basic abc",
      "Bearer abc",
      `Bearer ${f.token} extra`,
    ]) {
      expectGuestNotFound(
        await app.inject({
          method: "GET",
          url: "/api/public/bookings/manage",
          headers: { authorization },
        }),
      );
    }
    expectGuestNotFound(await f.request("GET", generateGuestManagementToken()));
    expectGuestNotFound(
      await app.inject({
        method: "GET",
        url: `/api/public/bookings/manage?publicReference=${f.booking.public_reference}`,
      }),
    );
  });

  it("returns only the guest DTO with live names and Booking snapshots", async () => {
    const f = await fixture();
    await db
      .updateTable("organization")
      .set({ name: "Live organization" })
      .where("id", "=", f.organization.id)
      .execute();
    await db
      .updateTable("resource")
      .set({ name: "Live resource" })
      .where("id", "=", f.resource.id)
      .execute();
    await db
      .updateTable("service")
      .set({ name: "Live service", duration_minutes: 15, price_agorot: 1 })
      .where("id", "=", f.service.id)
      .execute();
    const response = await f.request("GET");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      publicReference: f.booking.public_reference,
      status: "confirmed",
      organizationName: "Live organization",
      resourceName: "Live resource",
      serviceName: "Live service",
      startAt: startAt.toISOString(),
      serviceEndAt: new Date(startAt.getTime() + 45 * 60_000).toISOString(),
      durationMinutes: 45,
      priceAgorot: 5000,
      guestName: "Guest name",
      guestPhone: "050-123-4567",
      guestEmail: "guest@example.test",
      customerNote: "Guest note",
      cancelledAt: null,
      cancellationReason: null,
      cancellationDeadlineAt: new Date(
        startAt.getTime() - 60 * 60_000,
      ).toISOString(),
      canCancel: true,
    });
    expect(response.body).not.toMatch(
      /organizationId|resourceId|serviceId|cancelledBy|token|hash/i,
    );
  });

  it.each(["archived_at", "suspended_at", "published_at"] as const)(
    "keeps existing Booking reads available after %s changes",
    async (column) => {
      const f = await fixture();
      await db
        .updateTable("organization")
        .set({ [column]: column === "published_at" ? null : routeNow })
        .where("id", "=", f.organization.id)
        .execute();
      expect((await f.request("GET")).statusCode).toBe(200);
    },
  );

  it("keeps reads available while public Booking is paused", async () => {
    const f = await fixture();
    await db
      .updateTable("organization")
      .set({ public_booking_paused: true })
      .where("id", "=", f.organization.id)
      .execute();
    expect((await f.request("GET")).statusCode).toBe(200);
  });

  it("cancels with guest metadata, normalized reason, and a persistent token", async () => {
    const f = await fixture();
    const response = await f.request("POST", f.token, {
      reason: "  Guest changed plans  ",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      publicReference: f.booking.public_reference,
      status: "cancelled",
      cancelledAt: routeNow.toISOString(),
      cancellationReason: "Guest changed plans",
    });
    expect(
      await db
        .selectFrom("booking")
        .select([
          "cancelled_by_user_id",
          "guest_management_token_hash",
          "updated_at",
        ])
        .where("id", "=", f.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      cancelled_by_user_id: null,
      guest_management_token_hash: hashGuestManagementToken(f.token),
      updated_at: routeNow,
    });
    const read = await f.request("GET");
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      status: "cancelled",
      canCancel: false,
    });
  });

  it.each([undefined, null, "   "])(
    "normalizes omitted/null/blank reason %s to null",
    async (reason) => {
      const f = await fixture();
      const response = await f.request(
        "POST",
        f.token,
        reason === undefined ? undefined : { reason },
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ cancellationReason: null });
    },
  );

  it("rejects invalid bodies without changing the Booking", async () => {
    const f = await fixture();
    for (const payload of [{ reason: 42 }, { reason: "valid", extra: true }]) {
      const response = await f.request("POST", f.token, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("FST_ERR_VALIDATION");
    }
    expect(
      await db
        .selectFrom("booking")
        .select("status")
        .where("id", "=", f.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "confirmed" });
  });

  it.each(["cancelled", "no_show"] as const)(
    "rejects guest cancellation from %s while retaining read access",
    async (status) => {
      const f = await fixture({ status });
      const response = await f.request("POST");
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("INVALID_BOOKING_STATUS");
      expect((await f.request("GET")).statusCode).toBe(200);
    },
  );

  it("uses the snapshotted cutoff rather than the current Organization setting", async () => {
    const old = await fixture({ cancellationCutoffMinutes: 0 });
    await db
      .updateTable("organization")
      .set({ cancellation_cutoff_minutes: 1440 })
      .where("id", "=", old.organization.id)
      .execute();
    expect(
      await cancelGuestManagedBooking(
        { token: old.token },
        new Date(startAt.getTime() - 1),
      ),
    ).toMatchObject({ ok: true });

    const current = await fixture({ cancellationCutoffMinutes: 1440 });
    expect(
      await cancelGuestManagedBooking(
        { token: current.token },
        new Date(startAt.getTime() - 1),
      ),
    ).toEqual({ ok: false, reason: "cancellation_cutoff_passed" });
  });

  it.each([
    ["archived_at", "ORGANIZATION_ARCHIVED"],
    ["suspended_at", "ORGANIZATION_SUSPENDED"],
  ] as const)("blocks %s writes but allows reads", async (column, code) => {
    const f = await fixture();
    await db
      .updateTable("organization")
      .set({ [column]: routeNow })
      .where("id", "=", f.organization.id)
      .execute();
    expect((await f.request("GET")).statusCode).toBe(200);
    const response = await f.request("POST");
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe(code);
  });

  it("allows exactly one of two concurrent cancellations", async () => {
    const f = await fixture();
    const results = await Promise.all([
      cancelGuestManagedBooking({ token: f.token }, routeNow),
      cancelGuestManagedBooking({ token: f.token }, routeNow),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "invalid_booking_status" },
    ]);
  });

  it("serializes guest and management cancellation without reversing locks", async () => {
    const f = await fixture();
    const owner = await createTestUser();
    await addTestMembership({
      organizationId: f.organization.id,
      userId: owner.id,
      role: "owner",
    });
    const results = await Promise.all([
      cancelGuestManagedBooking({ token: f.token }, routeNow),
      cancelManagementBooking(
        {
          userId: owner.id,
          organizationId: f.organization.id,
          bookingId: f.booking.id,
        },
        routeNow,
      ),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "invalid_booking_status" },
    ]);
  });

  it("does not let one Booking token identify another Booking", async () => {
    const first = await fixture();
    const second = await fixture();
    const result = await getGuestManagedBooking(first.token, routeNow);
    expect(result).toMatchObject({
      ok: true,
      booking: { publicReference: first.booking.public_reference },
    });
    if (result.ok)
      expect(result.booking.publicReference).not.toBe(
        second.booking.public_reference,
      );
  });

  it("maps cutoff expiry at the route", async () => {
    const f = await fixture({ cancellationCutoffMinutes: 180 });
    const response = await f.request("POST");
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("CANCELLATION_CUTOFF_PASSED");
  });

  it("preserves generic token failures on cancellation", async () => {
    const f = await fixture();
    expectGuestNotFound(await f.request("POST", null));
    expectGuestNotFound(
      await f.request("POST", generateGuestManagementToken()),
    );
  });

  it("keeps management cancellation visible and does not overwrite it", async () => {
    const f = await fixture();
    const owner = await createTestUser();
    await addTestMembership({
      organizationId: f.organization.id,
      userId: owner.id,
      role: "owner",
    });
    expect(
      await cancelManagementBooking(
        {
          userId: owner.id,
          organizationId: f.organization.id,
          bookingId: f.booking.id,
          reason: "Manager reason",
        },
        routeNow,
      ),
    ).toMatchObject({ ok: true });
    const read = await f.request("GET");
    expect(read.json()).toMatchObject({
      status: "cancelled",
      cancellationReason: "Manager reason",
    });
    expect((await f.request("POST")).json().code).toBe(
      "INVALID_BOOKING_STATUS",
    );
  });

  it("keeps no-show visible and permits cancellation after management reverts it", async () => {
    const f = await fixture();
    const owner = await createTestUser();
    await addTestMembership({
      organizationId: f.organization.id,
      userId: owner.id,
      role: "owner",
    });
    const input = {
      userId: owner.id,
      organizationId: f.organization.id,
      bookingId: f.booking.id,
    };
    expect(await markManagementBookingNoShow(input, startAt)).toMatchObject({
      ok: true,
    });
    expect((await f.request("GET")).json()).toMatchObject({
      status: "no_show",
      canCancel: false,
    });
    expect((await f.request("POST")).json().code).toBe(
      "INVALID_BOOKING_STATUS",
    );
    expect(await revertManagementBookingNoShow(input, startAt)).toMatchObject({
      ok: true,
    });
    expect(await f.request("POST")).toMatchObject({ statusCode: 200 });
  });

  it("derives a new deadline from a management-rescheduled start using the same token", async () => {
    const f = await fixture({ cancellationCutoffMinutes: 60 });
    const owner = await createTestUser();
    await addTestMembership({
      organizationId: f.organization.id,
      userId: owner.id,
      role: "owner",
    });
    await db
      .insertInto("resource_service")
      .values({
        organization_id: f.organization.id,
        resource_id: f.resource.id,
        service_id: f.service.id,
      })
      .execute();
    await db
      .insertInto("organization_weekly_hours")
      .values({
        organization_id: f.organization.id,
        weekday: 1,
        start_minute: 900,
        end_minute: 1020,
      })
      .execute();
    expect(
      await rescheduleManagementBooking(
        {
          userId: owner.id,
          organizationId: f.organization.id,
          bookingId: f.booking.id,
          resourceId: f.resource.id,
          date: "2026-10-05",
          startMinute: 960,
        },
        routeNow,
      ),
    ).toMatchObject({ ok: true });
    const result = await getGuestManagedBooking(
      f.token,
      new Date("2026-10-05T12:00:00.000Z"),
    );
    expect(result).toMatchObject({
      ok: true,
      booking: {
        startAt: "2026-10-05T13:00:00.000Z",
        cancellationDeadlineAt: "2026-10-05T12:00:00.000Z",
        canCancel: true,
      },
    });
    expect(
      await db
        .selectFrom("booking")
        .select(["cancellation_cutoff_minutes", "guest_management_token_hash"])
        .where("id", "=", f.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      cancellation_cutoff_minutes: 60,
      guest_management_token_hash: hashGuestManagementToken(f.token),
    });
  });
});
