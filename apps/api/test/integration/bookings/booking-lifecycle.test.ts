import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import type { BookingStatus, MembershipRole } from "../../../src/db-types.js";
import { resolveResourceServiceFreeSlotStartsForDate } from "../../../src/modules/availability/resolvers/resource-service-free-slots.js";
import {
  cancelManagementBooking,
  markManagementBookingNoShow,
  revertManagementBookingNoShow,
} from "../../../src/modules/bookings/application/lifecycle.js";
import {
  addTestMembership,
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

const startAt = new Date("2026-10-05T06:00:00.000Z");
const afterStart = new Date("2026-10-05T07:00:00.000Z");

async function fixture({
  role = "owner",
  linked = role === "staff",
  status = "confirmed",
  bookingResource = "primary",
}: {
  role?: MembershipRole;
  linked?: boolean;
  status?: BookingStatus;
  bookingResource?: "primary" | "other";
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
    name: "Lifecycle resource",
  });
  const otherResource = await createTestResource({
    organizationId: organization.id,
    name: "Other resource",
  });
  const service = await createTestService({
    organizationId: organization.id,
    durationMinutes: 30,
  });
  const booking = await createTestBooking({
    organizationId: organization.id,
    resourceId: bookingResource === "primary" ? resource.id : otherResource.id,
    serviceId: service.id,
    publicReference: `LIFE-${randomUUID()}`,
    status,
    startAt,
    durationMinutes: 30,
    bufferAfterMinutes: 0,
    cancelledAt:
      status === "cancelled" ? new Date("2026-10-05T05:00:00.000Z") : null,
    cancelledByUserId: status === "cancelled" ? actor.id : null,
    cancellationReason: status === "cancelled" ? "Existing reason" : null,
  });
  const input = {
    userId: actor.id,
    organizationId: organization.id,
    bookingId: booking.id,
  };
  return {
    actor,
    organization,
    resource,
    otherResource,
    service,
    booking,
    input,
    cancel: (reason?: string | null, now: Date = afterStart) =>
      cancelManagementBooking(
        { ...input, ...(reason === undefined ? {} : { reason }) },
        now,
      ),
    markNoShow: (now: Date = afterStart) =>
      markManagementBookingNoShow(input, now),
    revertNoShow: (now: Date = afterStart) =>
      revertManagementBookingNoShow(input, now),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function configureAvailability(f: Fixture) {
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
}

async function freeStarts(f: Fixture) {
  const result = await resolveResourceServiceFreeSlotStartsForDate({
    userId: f.actor.id,
    organizationId: f.organization.id,
    resourceId: f.resource.id,
    serviceId: f.service.id,
    date: "2026-10-05",
  });
  if (!result.ok) throw new Error(`Expected free slots: ${result.reason}`);
  return result.slots.starts;
}

describe("management Booking cancellation", () => {
  it.each(["owner", "manager"] as const)(
    "allows %s to cancel any Organization Booking",
    async (role) => {
      const f = await fixture({ role });
      expect(await f.cancel()).toMatchObject({
        ok: true,
        booking: { id: f.booking.id, status: "cancelled" },
      });
    },
  );

  it("allows Staff for their linked Resource and denies other or unlinked Resources", async () => {
    const own = await fixture({ role: "staff" });
    expect(await own.cancel()).toMatchObject({ ok: true });
    const other = await fixture({
      role: "staff",
      bookingResource: "other",
    });
    expect(await other.cancel()).toEqual({
      ok: false,
      reason: "insufficient_role",
    });
    const unlinked = await fixture({ role: "staff", linked: false });
    expect(await unlinked.cancel()).toEqual({
      ok: false,
      reason: "insufficient_role",
    });
  });

  it("preserves membership then tenant-scoped Booking anti-leak ordering", async () => {
    const f = await fixture();
    expect(
      await cancelManagementBooking(
        { ...f.input, userId: randomUUID() },
        afterStart,
      ),
    ).toEqual({ ok: false, reason: "organization_not_found" });
    expect(
      await cancelManagementBooking(
        { ...f.input, bookingId: randomUUID() },
        afterStart,
      ),
    ).toEqual({ ok: false, reason: "booking_not_found" });
    const other = await fixture();
    expect(
      await cancelManagementBooking(
        { ...f.input, bookingId: other.booking.id },
        afterStart,
      ),
    ).toEqual({ ok: false, reason: "booking_not_found" });
  });

  it.each([
    ["archived_at", "organization_archived"],
    ["suspended_at", "organization_suspended"],
  ] as const)("rejects %s Organization writes", async (column, reason) => {
    const f = await fixture();
    await db
      .updateTable("organization")
      .set({ [column]: new Date() })
      .where("id", "=", f.organization.id)
      .execute();
    expect(await f.cancel()).toEqual({ ok: false, reason });
  });

  it("cancels history attached to deactivated Resource and Service", async () => {
    const f = await fixture();
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
    expect(await f.cancel()).toMatchObject({ ok: true });
  });

  it.each([
    [new Date("2026-10-05T05:00:00.000Z"), "before"],
    [startAt, "at"],
    [afterStart, "after"],
  ] as const)("allows cancellation %s start", async (now, _position) => {
    const f = await fixture();
    expect(await f.cancel(undefined, now)).toMatchObject({ ok: true });
  });

  it.each([
    [undefined, null],
    [null, null],
    ["   ", null],
    ["  Guest requested  ", "Guest requested"],
  ] as const)("normalizes reason %s", async (reason, expected) => {
    const f = await fixture();
    const now = new Date("2026-10-05T07:15:00.000Z");
    const result = await f.cancel(reason, now);
    expect(result).toMatchObject({
      ok: true,
      booking: {
        status: "cancelled",
        cancelledAt: now.toISOString(),
        cancellationReason: expected,
        updatedAt: now.toISOString(),
      },
    });
    expect(
      await db
        .selectFrom("booking")
        .select(["cancelled_by_user_id", "cancellation_reason", "updated_at"])
        .where("id", "=", f.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      cancelled_by_user_id: f.actor.id,
      cancellation_reason: expected,
      updated_at: now,
    });
  });

  it.each(["cancelled", "no_show"] as const)(
    "rejects cancellation from %s",
    async (status) => {
      const f = await fixture({ status });
      expect(await f.cancel()).toEqual({
        ok: false,
        reason: "invalid_booking_status",
      });
    },
  );

  it("releases confirmed capacity without deleting the Booking", async () => {
    const f = await fixture();
    await configureAvailability(f);
    expect(await freeStarts(f)).toEqual([570]);
    expect(await f.cancel()).toMatchObject({ ok: true });
    expect(await freeStarts(f)).toEqual([540, 555, 570]);
    expect(
      await db
        .selectFrom("booking")
        .select("status")
        .where("id", "=", f.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "cancelled" });
  });
});

describe("management Booking no-show lifecycle", () => {
  it.each(["owner", "manager"] as const)(
    "allows %s to mark a confirmed Booking no-show",
    async (role) => {
      const f = await fixture({ role });
      expect(await f.markNoShow()).toMatchObject({
        ok: true,
        booking: { status: "no_show" },
      });
    },
  );

  it("applies Staff Resource scope to mark and revert", async () => {
    const own = await fixture({ role: "staff" });
    expect(await own.markNoShow()).toMatchObject({ ok: true });
    expect(await own.revertNoShow()).toMatchObject({ ok: true });
    const other = await fixture({
      role: "staff",
      bookingResource: "other",
    });
    expect(await other.markNoShow()).toEqual({
      ok: false,
      reason: "insufficient_role",
    });
    const otherNoShow = await fixture({
      role: "staff",
      status: "no_show",
      bookingResource: "other",
    });
    expect(await otherNoShow.revertNoShow()).toEqual({
      ok: false,
      reason: "insufficient_role",
    });
  });

  it("rejects no-show before start and allows it at or after start", async () => {
    const early = await fixture();
    expect(await early.markNoShow(new Date(startAt.getTime() - 1))).toEqual({
      ok: false,
      reason: "no_show_too_early",
    });
    for (const now of [startAt, afterStart]) {
      const f = await fixture();
      expect(await f.markNoShow(now)).toMatchObject({ ok: true });
    }
  });

  it.each(["cancelled", "no_show"] as const)(
    "rejects mark no-show from %s",
    async (status) => {
      const f = await fixture({ status });
      expect(await f.markNoShow()).toEqual({
        ok: false,
        reason: "invalid_booking_status",
      });
    },
  );

  it("marks no-show without cancellation metadata", async () => {
    const f = await fixture();
    const result = await f.markNoShow();
    expect(result).toMatchObject({
      ok: true,
      booking: {
        status: "no_show",
        cancelledAt: null,
        cancellationReason: null,
        updatedAt: afterStart.toISOString(),
      },
    });
    expect(
      await db
        .selectFrom("booking")
        .select(["cancelled_at", "cancelled_by_user_id", "cancellation_reason"])
        .where("id", "=", f.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
    });
  });

  it.each(["owner", "manager"] as const)(
    "allows %s to revert no-show to confirmed",
    async (role) => {
      const f = await fixture({ role, status: "no_show" });
      expect(await f.revertNoShow()).toMatchObject({
        ok: true,
        booking: {
          status: "confirmed",
          updatedAt: afterStart.toISOString(),
        },
      });
    },
  );

  it.each(["confirmed", "cancelled"] as const)(
    "rejects revert from %s",
    async (status) => {
      const f = await fixture({ status });
      expect(await f.revertNoShow()).toEqual({
        ok: false,
        reason: "invalid_booking_status",
      });
    },
  );

  it("releases capacity on no-show and blocks it again after revert", async () => {
    const f = await fixture();
    await configureAvailability(f);
    expect(await freeStarts(f)).toEqual([570]);
    expect(await f.markNoShow()).toMatchObject({ ok: true });
    expect(await freeStarts(f)).toEqual([540, 555, 570]);
    expect(await f.revertNoShow()).toMatchObject({ ok: true });
    expect(await freeStarts(f)).toEqual([570]);
  });

  it("maps exact exclusion conflict and rolls back no-show revert", async () => {
    const f = await fixture({ status: "no_show" });
    const competing = await createTestBooking({
      organizationId: f.organization.id,
      resourceId: f.resource.id,
      serviceId: f.service.id,
      publicReference: `COMPETE-${randomUUID()}`,
      startAt,
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });
    expect(await f.revertNoShow()).toEqual({
      ok: false,
      reason: "booking_conflict",
    });
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

  it("serializes concurrent cancel and mark-no-show on one confirmed Booking", async () => {
    const f = await fixture();
    const results = await Promise.all([f.cancel(), f.markNoShow()]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "invalid_booking_status" },
    ]);
    const row = await db
      .selectFrom("booking")
      .select("status")
      .where("id", "=", f.booking.id)
      .executeTakeFirstOrThrow();
    expect(["cancelled", "no_show"]).toContain(row.status);
  });

  it("rejects invalid injected operation time", async () => {
    const f = await fixture();
    await expect(f.cancel(undefined, new Date(Number.NaN))).rejects.toThrow(
      "valid Date",
    );
    await expect(f.markNoShow(new Date(Number.NaN))).rejects.toThrow(
      "valid Date",
    );
    await expect(f.revertNoShow(new Date(Number.NaN))).rejects.toThrow(
      "valid Date",
    );
  });
});
