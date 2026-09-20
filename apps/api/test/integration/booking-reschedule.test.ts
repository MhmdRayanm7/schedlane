import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import type { BookingStatus, MembershipRole } from "../../src/db-types.js";
import { resolveResourceServiceFreeSlotStartsForDate } from "../../src/modules/availability/resource-service-free-slot-resolver.js";
import { rescheduleManagementBooking } from "../../src/modules/bookings/booking-reschedule-service.js";
import {
  addTestMembership,
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../helpers/factories.js";

const date = "2026-10-05";
const operationNow = new Date("2026-10-05T05:00:00.000Z");
const originalStartAt = new Date("2026-10-05T06:00:00.000Z");

async function fixture({
  role = "owner",
  status = "confirmed",
  sourceLinked = role === "staff",
  sourceDeactivated = false,
  targetDeactivated = false,
  durationMinutes = 30,
  bufferAfterMinutes = 10,
}: {
  role?: MembershipRole;
  status?: BookingStatus;
  sourceLinked?: boolean;
  sourceDeactivated?: boolean;
  targetDeactivated?: boolean;
  durationMinutes?: number;
  bufferAfterMinutes?: number;
} = {}) {
  const actor = await createTestUser();
  const organization = await createTestOrganization();
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role,
  });
  const source = await createTestResource({
    organizationId: organization.id,
    userId: sourceLinked ? actor.id : null,
    name: "Source resource",
    deactivatedAt: sourceDeactivated ? new Date() : null,
  });
  const target = await createTestResource({
    organizationId: organization.id,
    name: "Target resource",
    deactivatedAt: targetDeactivated ? new Date() : null,
  });
  const service = await createTestService({
    organizationId: organization.id,
    durationMinutes,
    bufferAfterMinutes,
    priceAgorot: 8000,
  });
  const booking = await createTestBooking({
    organizationId: organization.id,
    resourceId: source.id,
    serviceId: service.id,
    publicReference: `MOVE-${randomUUID()}`,
    status,
    startAt: originalStartAt,
    durationMinutes,
    bufferAfterMinutes,
    priceAgorot: 8000,
    guestName: "Original guest",
    guestPhone: "+972500000000",
    guestEmail: "guest@example.test",
    customerNote: "Keep me",
    cancelledAt: status === "cancelled" ? operationNow : null,
    cancelledByUserId: status === "cancelled" ? actor.id : null,
  });
  const input = {
    userId: actor.id,
    organizationId: organization.id,
    bookingId: booking.id,
    resourceId: target.id,
    date,
    startMinute: 660,
  };
  return {
    actor,
    organization,
    source,
    target,
    service,
    booking,
    input,
    reschedule: (
      changes: Partial<typeof input> = {},
      now: Date = operationNow,
    ) => rescheduleManagementBooking({ ...input, ...changes }, now),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function addWeeklyHours(f: Fixture, startMinute = 540, endMinute = 900) {
  await db
    .insertInto("organization_weekly_hours")
    .values({
      organization_id: f.organization.id,
      weekday: 1,
      start_minute: startMinute,
      end_minute: endMinute,
    })
    .execute();
}

async function assign(
  f: Fixture,
  resourceId: string,
  serviceId = f.service.id,
) {
  await db
    .insertInto("resource_service")
    .values({
      organization_id: f.organization.id,
      resource_id: resourceId,
      service_id: serviceId,
    })
    .execute();
}

async function makeReady(f: Fixture) {
  await addWeeklyHours(f);
  await assign(f, f.source.id);
  await assign(f, f.target.id);
}

async function setResourceDateWindow(
  f: Fixture,
  resourceId: string,
  startMinute: number,
  endMinute: number,
) {
  const parent = {
    organization_id: f.organization.id,
    resource_id: resourceId,
    local_date: date,
  };
  await db.insertInto("resource_date_override").values(parent).execute();
  await db
    .insertInto("resource_date_override_interval")
    .values({ ...parent, start_minute: startMinute, end_minute: endMinute })
    .execute();
}

async function bookingRow(id: string) {
  return db
    .selectFrom("booking")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}

describe("management Booking reschedule", () => {
  it.each(["owner", "manager"] as const)(
    "allows %s to move any Organization Booking",
    async (role) => {
      const f = await fixture({ role });
      await makeReady(f);
      expect(await f.reschedule()).toMatchObject({
        ok: true,
        booking: {
          id: f.booking.id,
          status: "confirmed",
          resourceId: f.target.id,
          serviceId: f.service.id,
          startAt: "2026-10-05T08:00:00.000Z",
          serviceEndAt: "2026-10-05T08:30:00.000Z",
          occupiedUntilAt: "2026-10-05T08:40:00.000Z",
          durationMinutes: 30,
          bufferAfterMinutes: 10,
          priceAgorot: 8000,
          updatedAt: operationNow.toISOString(),
        },
      });
    },
  );

  it("allows Staff only on their own linked source and target Resource", async () => {
    const own = await fixture({ role: "staff" });
    await addWeeklyHours(own);
    await assign(own, own.source.id);
    expect(
      await own.reschedule({ resourceId: own.source.id, startMinute: 600 }),
    ).toMatchObject({ ok: true });

    const foreignSource = await fixture({
      role: "staff",
      sourceLinked: false,
    });
    await makeReady(foreignSource);
    expect(await foreignSource.reschedule()).toEqual({
      ok: false,
      reason: "insufficient_role",
    });

    const foreignTarget = await fixture({ role: "staff" });
    await makeReady(foreignTarget);
    expect(await foreignTarget.reschedule()).toEqual({
      ok: false,
      reason: "insufficient_role",
    });
  });

  it("preserves membership, Booking, then target Resource anti-leak ordering", async () => {
    const f = await fixture();
    await makeReady(f);
    expect(
      await f.reschedule({ userId: randomUUID(), resourceId: randomUUID() }),
    ).toEqual({ ok: false, reason: "organization_not_found" });
    expect(
      await f.reschedule({ bookingId: randomUUID(), resourceId: randomUUID() }),
    ).toEqual({ ok: false, reason: "booking_not_found" });

    const other = await fixture();
    expect(await f.reschedule({ bookingId: other.booking.id })).toEqual({
      ok: false,
      reason: "booking_not_found",
    });
    expect(await f.reschedule({ resourceId: other.target.id })).toEqual({
      ok: false,
      reason: "resource_not_found",
    });
  });

  it.each([
    ["archived_at", "organization_archived"],
    ["suspended_at", "organization_suspended"],
  ] as const)("rejects %s Organization writes", async (column, reason) => {
    const f = await fixture();
    await makeReady(f);
    await db
      .updateTable("organization")
      .set({ [column]: new Date() })
      .where("id", "=", f.organization.id)
      .execute();
    expect(await f.reschedule()).toEqual({ ok: false, reason });
  });

  it.each(["cancelled", "no_show"] as const)(
    "rejects a %s Booking without changing status",
    async (status) => {
      const f = await fixture({ status });
      await makeReady(f);
      expect(await f.reschedule()).toEqual({
        ok: false,
        reason: "invalid_booking_status",
      });
      expect((await bookingRow(f.booking.id)).status).toBe(status);
    },
  );

  it("validates date, minute, DST wall time, and injected now before DB work", async () => {
    const f = await fixture();
    expect(await f.reschedule({ date: "2026-02-30" })).toEqual({
      ok: false,
      reason: "invalid_date",
    });
    for (const startMinute of [-1, 1440, 10.5])
      expect(await f.reschedule({ startMinute })).toEqual({
        ok: false,
        reason: "invalid_start_time",
      });
    expect(
      await f.reschedule({ date: "2026-03-27", startMinute: 120 }),
    ).toEqual({ ok: false, reason: "invalid_start_time" });
    expect(await f.reschedule({ date: "2026-10-25", startMinute: 60 })).toEqual(
      { ok: false, reason: "invalid_start_time" },
    );
    await expect(f.reschedule({}, new Date(Number.NaN))).rejects.toThrow(
      "valid Date",
    );
  });

  it("rejects past targets and permits exact equality and future starts", async () => {
    const past = await fixture();
    await makeReady(past);
    expect(
      await past.reschedule(
        { resourceId: past.source.id, startMinute: 540 },
        new Date(originalStartAt.getTime() + 1),
      ),
    ).toEqual({ ok: false, reason: "reschedule_start_in_past" });

    const equal = await fixture();
    await makeReady(equal);
    expect(
      await equal.reschedule(
        { resourceId: equal.source.id, startMinute: 540 },
        originalStartAt,
      ),
    ).toMatchObject({ ok: true });

    const future = await fixture();
    await makeReady(future);
    expect(await future.reschedule()).toMatchObject({ ok: true });
  });

  it("ignores public notice, horizon, publication, and pause policies", async () => {
    const f = await fixture();
    await makeReady(f);
    await db
      .updateTable("organization")
      .set({
        min_booking_notice_minutes: 10080,
        max_booking_horizon_days: 0,
        published_at: null,
        public_booking_paused: true,
      })
      .where("id", "=", f.organization.id)
      .execute();
    expect(await f.reschedule()).toMatchObject({ ok: true });
  });

  it("rejects inactive targets but moves away from an inactive source", async () => {
    const inactiveTarget = await fixture({ targetDeactivated: true });
    await makeReady(inactiveTarget);
    expect(await inactiveTarget.reschedule()).toEqual({
      ok: false,
      reason: "resource_inactive",
    });

    const inactiveSource = await fixture({ sourceDeactivated: true });
    await makeReady(inactiveSource);
    expect(await inactiveSource.reschedule()).toMatchObject({ ok: true });

    const staying = await fixture({ sourceDeactivated: true });
    await makeReady(staying);
    expect(await staying.reschedule({ resourceId: staying.source.id })).toEqual(
      { ok: false, reason: "resource_inactive" },
    );
  });

  it("requires the immutable Service assignment on the target", async () => {
    const f = await fixture();
    await addWeeklyHours(f);
    expect(await f.reschedule()).toEqual({
      ok: false,
      reason: "service_not_assigned",
    });
    await assign(f, f.target.id);
    expect(await f.reschedule()).toMatchObject({
      ok: true,
      booking: { serviceId: f.service.id },
    });
  });

  it("uses immutable duration, buffer, price, Service, and guest snapshots", async () => {
    const f = await fixture();
    await addWeeklyHours(f);
    await setResourceDateWindow(f, f.target.id, 660, 700);
    await assign(f, f.target.id);
    await db
      .updateTable("service")
      .set({
        duration_minutes: 60,
        buffer_after_minutes: 20,
        price_agorot: 10000,
        deactivated_at: new Date(),
      })
      .where("id", "=", f.service.id)
      .execute();
    await db
      .updateTable("organization")
      .set({ pricing_enabled: false })
      .where("id", "=", f.organization.id)
      .execute();

    expect(await f.reschedule()).toMatchObject({
      ok: true,
      booking: {
        serviceId: f.service.id,
        durationMinutes: 30,
        bufferAfterMinutes: 10,
        priceAgorot: 8000,
        serviceEndAt: "2026-10-05T08:30:00.000Z",
        occupiedUntilAt: "2026-10-05T08:40:00.000Z",
      },
    });
    expect(await bookingRow(f.booking.id)).toMatchObject({
      service_id: f.service.id,
      duration_minutes: 30,
      buffer_after_minutes: 10,
      price_agorot: 8000,
      guest_name: "Original guest",
      guest_phone: "+972500000000",
      guest_email: "guest@example.test",
      customer_note: "Keep me",
      public_reference: f.booking.public_reference,
      status: "confirmed",
    });
  });

  it("rejects a target that fits current Service timing but not longer Booking snapshots", async () => {
    const f = await fixture({ durationMinutes: 60, bufferAfterMinutes: 0 });
    await addWeeklyHours(f);
    await setResourceDateWindow(f, f.target.id, 660, 705);
    await assign(f, f.target.id);
    await db
      .updateTable("service")
      .set({ duration_minutes: 30 })
      .where("id", "=", f.service.id)
      .execute();
    expect(await f.reschedule()).toEqual({
      ok: false,
      reason: "start_not_available",
    });
  });

  it("uses the Booking buffer when validating fit", async () => {
    const f = await fixture({ durationMinutes: 30, bufferAfterMinutes: 20 });
    await addWeeklyHours(f);
    await setResourceDateWindow(f, f.target.id, 660, 705);
    await assign(f, f.target.id);
    await db
      .updateTable("service")
      .set({ buffer_after_minutes: 0 })
      .where("id", "=", f.service.id)
      .execute();
    expect(await f.reschedule()).toEqual({
      ok: false,
      reason: "start_not_available",
    });
  });

  it("composes date overrides, Time Blocks, and an interval-17 grid", async () => {
    const f = await fixture({ durationMinutes: 30, bufferAfterMinutes: 0 });
    await db
      .updateTable("organization")
      .set({ slot_interval_minutes: 17 })
      .where("id", "=", f.organization.id)
      .execute();
    await setResourceDateWindow(f, f.target.id, 550, 650);
    await assign(f, f.target.id);
    await db
      .insertInto("resource_time_block")
      .values({
        organization_id: f.organization.id,
        resource_id: f.target.id,
        local_date: date,
        start_minute: 584,
        end_minute: 614,
      })
      .execute();

    expect(await f.reschedule({ startMinute: 584 })).toEqual({
      ok: false,
      reason: "start_not_available",
    });
    expect(await f.reschedule({ startMinute: 555 })).toEqual({
      ok: false,
      reason: "start_not_available",
    });
    expect(await f.reschedule({ startMinute: 550 })).toMatchObject({
      ok: true,
    });
  });

  it("frees the old Resource and blocks the new Resource after a move", async () => {
    const f = await fixture({ durationMinutes: 30, bufferAfterMinutes: 0 });
    await makeReady(f);
    expect(await f.reschedule()).toMatchObject({ ok: true });

    const sourceFree = await resolveResourceServiceFreeSlotStartsForDate({
      userId: f.actor.id,
      organizationId: f.organization.id,
      resourceId: f.source.id,
      serviceId: f.service.id,
      date,
    });
    const targetFree = await resolveResourceServiceFreeSlotStartsForDate({
      userId: f.actor.id,
      organizationId: f.organization.id,
      resourceId: f.target.id,
      serviceId: f.service.id,
      date,
    });
    expect(sourceFree.ok && sourceFree.slots.starts).toContain(540);
    expect(targetFree.ok && targetFree.slots.starts).not.toContain(660);
  });

  it("maps occupancy conflict and rolls the complete move back", async () => {
    const f = await fixture();
    await makeReady(f);
    const competing = await createTestBooking({
      organizationId: f.organization.id,
      resourceId: f.target.id,
      serviceId: f.service.id,
      publicReference: `BLOCK-${randomUUID()}`,
      startAt: new Date("2026-10-05T08:00:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });
    expect(await f.reschedule()).toEqual({
      ok: false,
      reason: "booking_conflict",
    });
    expect(await bookingRow(f.booking.id)).toMatchObject({
      resource_id: f.source.id,
      start_at: f.booking.start_at,
      service_end_at: f.booking.service_end_at,
      occupied_until_at: f.booking.occupied_until_at,
    });
    expect(await bookingRow(competing.id)).toMatchObject({
      resource_id: f.target.id,
      start_at: competing.start_at,
    });
  });

  it("allows a future exact same Resource and start without self-conflict", async () => {
    const f = await fixture();
    await makeReady(f);
    expect(
      await f.reschedule({ resourceId: f.source.id, startMinute: 540 }),
    ).toMatchObject({
      ok: true,
      booking: {
        resourceId: f.source.id,
        startAt: originalStartAt.toISOString(),
        durationMinutes: 30,
        bufferAfterMinutes: 10,
        priceAgorot: 8000,
      },
    });
  });

  it("allows exactly one of two concurrent moves into one target occupancy", async () => {
    const f = await fixture({ durationMinutes: 30, bufferAfterMinutes: 0 });
    await makeReady(f);
    const secondSource = await createTestResource({
      organizationId: f.organization.id,
      name: "Second source",
    });
    const second = await createTestBooking({
      organizationId: f.organization.id,
      resourceId: secondSource.id,
      serviceId: f.service.id,
      publicReference: `SECOND-${randomUUID()}`,
      startAt: new Date("2026-10-05T09:00:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });

    const results = await Promise.all([
      f.reschedule(),
      f.reschedule({ bookingId: second.id }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "booking_conflict" },
    ]);
    const rows = await db
      .selectFrom("booking")
      .select(["id", "resource_id", "start_at"])
      .where("id", "in", [f.booking.id, second.id])
      .execute();
    expect(
      rows.filter(
        (row) =>
          row.resource_id === f.target.id &&
          row.start_at.getTime() ===
            new Date("2026-10-05T08:00:00.000Z").getTime(),
      ),
    ).toHaveLength(1);
    const failedId = results[0]?.ok ? second.id : f.booking.id;
    const failed = rows.find((row) => row.id === failedId);
    expect(failed?.resource_id).toBe(
      failedId === second.id ? secondSource.id : f.source.id,
    );
  });
});
