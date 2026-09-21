import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import type { BookingStatus, MembershipRole } from "../../../src/db-types.js";
import type { MinuteInterval } from "../../../src/modules/availability/domain/minute-interval.js";
import { resolveResourceServiceFreeSlotStartsForDate } from "../../../src/modules/availability/resolvers/resource-service-free-slots.js";
import { resolveResourceServiceSlotStartsForDate } from "../../../src/modules/availability/resolvers/resource-service-slots.js";
import {
  addTestMembership,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

const date = "2026-10-05";

type FixtureOptions = {
  role?: MembershipRole;
  linkResourceToActor?: boolean;
  durationMinutes?: number;
  bufferAfterMinutes?: number;
  slotIntervalMinutes?: number;
};

async function fixture({
  role = "owner",
  linkResourceToActor = false,
  durationMinutes = 30,
  bufferAfterMinutes = 0,
  slotIntervalMinutes = 15,
}: FixtureOptions = {}) {
  const actor = await createTestUser();
  const organization = await createTestOrganization();
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role,
  });
  if (slotIntervalMinutes !== 15)
    await db
      .updateTable("organization")
      .set({ slot_interval_minutes: slotIntervalMinutes })
      .where("id", "=", organization.id)
      .execute();
  const resource = await createTestResource({
    organizationId: organization.id,
    userId: linkResourceToActor ? actor.id : null,
  });
  const service = await createTestService({
    organizationId: organization.id,
    durationMinutes,
    bufferAfterMinutes,
  });
  const input = {
    userId: actor.id,
    organizationId: organization.id,
    resourceId: resource.id,
    serviceId: service.id,
    date,
  };
  return {
    actor,
    organization,
    resource,
    service,
    input,
    resolve: (overrides: Partial<typeof input> = {}) =>
      resolveResourceServiceFreeSlotStartsForDate({ ...input, ...overrides }),
    configured: (overrides: Partial<typeof input> = {}) =>
      resolveResourceServiceSlotStartsForDate({ ...input, ...overrides }),
    success: (starts: number[], overrides: Partial<typeof input> = {}) => ({
      ok: true,
      slots: {
        timezone: "Asia/Jerusalem",
        resourceId: overrides.resourceId ?? resource.id,
        serviceId: overrides.serviceId ?? service.id,
        date: overrides.date ?? date,
        starts,
      },
    }),
  };
}

type TestFixture = Awaited<ReturnType<typeof fixture>>;

async function setWeeklyHours(
  f: TestFixture,
  weekday: number,
  intervals: readonly MinuteInterval[],
) {
  if (intervals.length === 0) return;
  await db
    .insertInto("organization_weekly_hours")
    .values(
      intervals.map((interval) => ({
        organization_id: f.organization.id,
        weekday,
        start_minute: interval.startMinute,
        end_minute: interval.endMinute,
      })),
    )
    .execute();
}

async function assignService(f: TestFixture, serviceId = f.service.id) {
  await db
    .insertInto("resource_service")
    .values({
      organization_id: f.organization.id,
      resource_id: f.resource.id,
      service_id: serviceId,
    })
    .execute();
}

type InsertBookingInput = {
  f: TestFixture;
  startAt: Date;
  serviceEndAt: Date;
  occupiedUntilAt: Date;
  durationMinutes: number;
  bufferAfterMinutes: number;
  status?: BookingStatus;
  resourceId?: string;
  serviceId?: string;
};

async function insertBooking({
  f,
  startAt,
  serviceEndAt,
  occupiedUntilAt,
  durationMinutes,
  bufferAfterMinutes,
  status = "confirmed",
  resourceId = f.resource.id,
  serviceId = f.service.id,
}: InsertBookingInput) {
  return db
    .insertInto("booking")
    .values({
      organization_id: f.organization.id,
      resource_id: resourceId,
      service_id: serviceId,
      public_reference: randomUUID(),
      status,
      start_at: startAt,
      service_end_at: serviceEndAt,
      occupied_until_at: occupiedUntilAt,
      duration_minutes: durationMinutes,
      buffer_after_minutes: bufferAfterMinutes,
      price_agorot: null,
      guest_name: "Free-slot test guest",
      guest_phone: null,
      guest_email: null,
      customer_note: null,
      cancelled_at:
        status === "cancelled" ? new Date("2026-10-04T18:00:00.000Z") : null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
    })
    .execute();
}

async function makeReady(
  f: TestFixture,
  intervals: readonly MinuteInterval[] = [{ startMinute: 540, endMinute: 720 }],
) {
  await setWeeklyHours(f, 1, intervals);
  await assignService(f);
}

describe("Resource-Service free slot resolver", () => {
  it("returns configured Service starts unchanged when there are no Bookings", async () => {
    const f = await fixture();
    await makeReady(f);
    const expected = f.success([
      540, 555, 570, 585, 600, 615, 630, 645, 660, 675, 690,
    ]);
    expect(await f.configured()).toEqual(expected);
    expect(await f.resolve()).toEqual(expected);
  });

  it("removes every candidate occupancy overlapping a confirmed Booking", async () => {
    const f = await fixture();
    await makeReady(f);
    await insertBooking({
      f,
      startAt: new Date("2026-10-05T07:00:00.000Z"),
      serviceEndAt: new Date("2026-10-05T07:30:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T07:30:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });

    expect(await f.resolve()).toEqual(
      f.success([540, 555, 570, 630, 645, 660, 675, 690]),
    );
    expect(await f.configured()).toEqual(
      f.success([540, 555, 570, 585, 600, 615, 630, 645, 660, 675, 690]),
    );
  });

  it("uses persisted existing Booking buffer after its Service changes", async () => {
    const f = await fixture({ durationMinutes: 45, bufferAfterMinutes: 15 });
    await makeReady(f, [{ startMinute: 540, endMinute: 660 }]);
    await insertBooking({
      f,
      startAt: new Date("2026-10-05T06:00:00.000Z"),
      serviceEndAt: new Date("2026-10-05T06:45:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T07:00:00.000Z"),
      durationMinutes: 45,
      bufferAfterMinutes: 15,
    });
    await db
      .updateTable("service")
      .set({ duration_minutes: 15, buffer_after_minutes: 0 })
      .where("id", "=", f.service.id)
      .execute();

    expect(await f.resolve()).toEqual(f.success([600, 615, 630, 645]));
  });

  it("includes the candidate Service buffer in overlap detection", async () => {
    const f = await fixture({ durationMinutes: 45, bufferAfterMinutes: 15 });
    await makeReady(f);
    await insertBooking({
      f,
      startAt: new Date("2026-10-05T07:00:00.000Z"),
      serviceEndAt: new Date("2026-10-05T07:30:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T07:30:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });

    expect(await f.resolve()).toEqual(f.success([540, 630, 645, 660]));
  });

  it("ignores cancelled and no_show Booking occupancy in the database query", async () => {
    const f = await fixture();
    await makeReady(f);
    for (const status of ["cancelled", "no_show"] as const)
      await insertBooking({
        f,
        status,
        startAt: new Date("2026-10-05T07:00:00.000Z"),
        serviceEndAt: new Date("2026-10-05T07:30:00.000Z"),
        occupiedUntilAt: new Date("2026-10-05T07:30:00.000Z"),
        durationMinutes: 30,
        bufferAfterMinutes: 0,
      });

    expect(await f.resolve()).toEqual(
      f.success([540, 555, 570, 585, 600, 615, 630, 645, 660, 675, 690]),
    );
  });

  it("ignores confirmed Booking occupancy on a different Resource", async () => {
    const f = await fixture();
    await makeReady(f);
    const otherResource = await createTestResource({
      organizationId: f.organization.id,
      name: "Other resource",
    });
    await insertBooking({
      f,
      resourceId: otherResource.id,
      startAt: new Date("2026-10-05T07:00:00.000Z"),
      serviceEndAt: new Date("2026-10-05T07:30:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T07:30:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });
    expect(await f.resolve()).toEqual(
      f.success([540, 555, 570, 585, 600, 615, 630, 645, 660, 675, 690]),
    );
  });

  it("lets a Booking for another Service block the same Resource", async () => {
    const f = await fixture();
    await setWeeklyHours(f, 1, [{ startMinute: 540, endMinute: 720 }]);
    const candidateService = await createTestService({
      organizationId: f.organization.id,
      name: "Candidate service",
      durationMinutes: 30,
    });
    await assignService(f, candidateService.id);
    await insertBooking({
      f,
      startAt: new Date("2026-10-05T07:00:00.000Z"),
      serviceEndAt: new Date("2026-10-05T07:30:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T07:30:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });

    const overrides = { serviceId: candidateService.id };
    expect(await f.resolve(overrides)).toEqual(
      f.success([540, 555, 570, 630, 645, 660, 675, 690], overrides),
    );
  });

  it("composes Time Block subtraction before Booking occupancy", async () => {
    const f = await fixture();
    await makeReady(f);
    await db
      .insertInto("resource_time_block")
      .values({
        organization_id: f.organization.id,
        resource_id: f.resource.id,
        local_date: date,
        start_minute: 585,
        end_minute: 615,
      })
      .execute();
    await insertBooking({
      f,
      startAt: new Date("2026-10-05T07:45:00.000Z"),
      serviceEndAt: new Date("2026-10-05T08:15:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T08:15:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });

    expect(await f.resolve()).toEqual(f.success([540, 555, 615, 675, 690]));
  });

  it("composes a Resource date override with Booking occupancy", async () => {
    const f = await fixture({ durationMinutes: 15 });
    await assignService(f);
    const parent = {
      organization_id: f.organization.id,
      resource_id: f.resource.id,
      local_date: date,
    };
    await db.insertInto("resource_date_override").values(parent).execute();
    await db
      .insertInto("resource_date_override_interval")
      .values({ ...parent, start_minute: 600, end_minute: 660 })
      .execute();
    await insertBooking({
      f,
      startAt: new Date("2026-10-05T07:15:00.000Z"),
      serviceEndAt: new Date("2026-10-05T07:30:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T07:30:00.000Z"),
      durationMinutes: 15,
      bufferAfterMinutes: 0,
    });

    expect(await f.resolve()).toEqual(f.success([600, 630, 645]));
  });

  it("preserves an interval-17 grid while subtracting Booking occupancy", async () => {
    const f = await fixture({ slotIntervalMinutes: 17, durationMinutes: 20 });
    await makeReady(f, [{ startMinute: 550, endMinute: 650 }]);
    await insertBooking({
      f,
      startAt: new Date("2026-10-05T06:50:00.000Z"),
      serviceEndAt: new Date("2026-10-05T07:10:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T07:10:00.000Z"),
      durationMinutes: 20,
      bufferAfterMinutes: 0,
    });

    expect(await f.resolve()).toEqual(f.success([550, 567, 618]));
  });

  it("returns success with no starts for an empty configured day", async () => {
    const f = await fixture();
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([]));
  });

  it("returns success with no starts when confirmed occupancy removes all", async () => {
    const f = await fixture({ durationMinutes: 15 });
    await makeReady(f, [{ startMinute: 540, endMinute: 570 }]);
    await insertBooking({
      f,
      startAt: new Date("2026-10-05T06:00:00.000Z"),
      serviceEndAt: new Date("2026-10-05T06:30:00.000Z"),
      occupiedUntilAt: new Date("2026-10-05T06:30:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });
    expect(await f.resolve()).toEqual(f.success([]));
  });

  it.each([
    ["2026-03-27", 5, 60, 240, [60, 90, 180, 210]],
    ["2026-10-25", 7, 0, 180, [0, 30, 120, 150]],
  ] as const)(
    "omits only ambiguous/nonexistent starts on %s",
    async (transitionDate, weekday, startMinute, endMinute, expected) => {
      const f = await fixture({ durationMinutes: 15, slotIntervalMinutes: 30 });
      await setWeeklyHours(f, weekday, [{ startMinute, endMinute }]);
      await assignService(f);
      expect(await f.resolve({ date: transitionDate })).toEqual(
        f.success([...expected], { date: transitionDate }),
      );
    },
  );

  it("retains configured resolver failures and management authorization", async () => {
    const f = await fixture({ role: "manager" });
    const owner = await createTestUser();
    await addTestMembership({
      organizationId: f.organization.id,
      userId: owner.id,
      role: "owner",
    });
    await db
      .updateTable("resource")
      .set({ user_id: owner.id })
      .where("id", "=", f.resource.id)
      .execute();
    expect(await f.resolve()).toEqual({
      ok: false,
      reason: "insufficient_role",
    });

    const allowed = await fixture();
    expect(await allowed.resolve()).toEqual({
      ok: false,
      reason: "service_not_assigned",
    });
    expect(await allowed.resolve({ date: "2026-02-30" })).toEqual({
      ok: false,
      reason: "invalid_date",
    });
  });

  it("keeps deactivated Resources and Services visible internally", async () => {
    const f = await fixture();
    await makeReady(f);
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
    expect(await f.resolve()).toMatchObject({ ok: true });
  });
});
