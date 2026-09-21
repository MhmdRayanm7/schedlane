import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import type { MembershipRole } from "../../src/db-types.js";
import type { MinuteInterval } from "../../src/modules/availability/minute-interval.js";
import {
  type CreateManualBookingInput,
  createManualBooking,
} from "../../src/modules/bookings/booking-service.js";
import {
  addTestMembership,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../helpers/factories.js";

const date = "2026-10-05";

type FixtureOptions = {
  role?: MembershipRole;
  linkResourceToActor?: boolean;
  pricingEnabled?: boolean;
  priceAgorot?: number | null;
  durationMinutes?: number;
  bufferAfterMinutes?: number;
  slotIntervalMinutes?: number;
  cancellationCutoffMinutes?: number;
};

async function fixture({
  role = "owner",
  linkResourceToActor = false,
  pricingEnabled = false,
  priceAgorot = null,
  durationMinutes = 30,
  bufferAfterMinutes = 0,
  slotIntervalMinutes = 15,
  cancellationCutoffMinutes = 0,
}: FixtureOptions = {}) {
  const actor = await createTestUser();
  const organization = await createTestOrganization({
    pricingEnabled,
    cancellationCutoffMinutes,
  });
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
    priceAgorot,
  });
  const input: CreateManualBookingInput = {
    userId: actor.id,
    organizationId: organization.id,
    resourceId: resource.id,
    serviceId: service.id,
    date,
    startMinute: 540,
    guestName: "Manual guest",
  };
  return {
    actor,
    organization,
    resource,
    service,
    input,
    create: (overrides: Partial<CreateManualBookingInput> = {}) =>
      createManualBooking({ ...input, ...overrides }),
  };
}

type TestFixture = Awaited<ReturnType<typeof fixture>>;

async function setMondayHours(
  f: TestFixture,
  intervals: readonly MinuteInterval[],
) {
  if (intervals.length === 0) return;
  await db
    .insertInto("organization_weekly_hours")
    .values(
      intervals.map((interval) => ({
        organization_id: f.organization.id,
        weekday: 1,
        start_minute: interval.startMinute,
        end_minute: interval.endMinute,
      })),
    )
    .execute();
}

async function assignService(f: TestFixture) {
  await db
    .insertInto("resource_service")
    .values({
      organization_id: f.organization.id,
      resource_id: f.resource.id,
      service_id: f.service.id,
    })
    .execute();
}

async function makeReady(
  f: TestFixture,
  intervals: readonly MinuteInterval[] = [{ startMinute: 540, endMinute: 720 }],
) {
  await setMondayHours(f, intervals);
  await assignService(f);
}

describe("Transactional manual Booking creation", () => {
  it("snapshots the Organization cancellation cutoff without issuing a token", async () => {
    const f = await fixture({ cancellationCutoffMinutes: 30 });
    await makeReady(f);
    const result = await f.create();
    if (!result.ok) throw new Error("Expected Booking creation to succeed");
    expect(
      await db
        .selectFrom("booking")
        .select(["cancellation_cutoff_minutes", "guest_management_token_hash"])
        .where("id", "=", result.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      cancellation_cutoff_minutes: 30,
      guest_management_token_hash: null,
    });
  });

  it("creates a confirmed Booking at the correct UTC instant with normalized guest data", async () => {
    const f = await fixture();
    await makeReady(f);
    const result = await f.create({
      guestName: "  Manual guest  ",
      guestPhone: "  02-531-0747  ",
      guestEmail: "  Manual@Example.test  ",
      customerNote: "Keep this note unchanged  ",
    });
    expect(result).toMatchObject({
      ok: true,
      booking: {
        publicReference: expect.stringMatching(
          /^BK-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/,
        ),
        status: "confirmed",
        organizationId: f.organization.id,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        startAt: "2026-10-05T06:00:00.000Z",
        serviceEndAt: "2026-10-05T06:30:00.000Z",
        occupiedUntilAt: "2026-10-05T06:30:00.000Z",
        guestName: "Manual guest",
        guestPhone: "+97225310747",
        guestEmail: "Manual@Example.test",
        customerNote: "Keep this note unchanged  ",
      },
    });
    if (!result.ok) throw new Error("Expected Booking creation to succeed");
    expect(result.booking.publicReference).not.toBe(result.booking.id);
    expect(
      await db
        .selectFrom("booking")
        .select(["start_at", "guest_phone", "guest_email", "customer_note"])
        .where("id", "=", result.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      start_at: new Date("2026-10-05T06:00:00.000Z"),
      guest_phone: "+97225310747",
      guest_email: "Manual@Example.test",
      customer_note: "Keep this note unchanged  ",
    });
  });

  it.each([undefined, null, "   "])(
    "stores optional manual phone %j as null",
    async (guestPhone) => {
      const f = await fixture();
      await makeReady(f);
      const result = await f.create(
        guestPhone === undefined ? {} : { guestPhone },
      );
      expect(result).toMatchObject({
        ok: true,
        booking: { guestPhone: null },
      });
    },
  );

  it.each(["invalid", "0891234567", "+12025550123"])(
    "rejects invalid or foreign manual phone %s",
    async (guestPhone) => {
      const f = await fixture();
      expect(await f.create({ guestPhone })).toEqual({
        ok: false,
        reason: "invalid_guest_phone",
      });
      expect(await db.selectFrom("booking").select("id").execute()).toEqual([]);
    },
  );

  it.each(["owner", "manager"] as const)(
    "allows an %s to create for an unlinked Resource",
    async (role) => {
      const f = await fixture({ role });
      await makeReady(f);
      expect(await f.create()).toMatchObject({ ok: true });
    },
  );

  it("allows a Manager to book a Resource linked to an Owner", async () => {
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
    await makeReady(f);
    expect(await f.create()).toMatchObject({ ok: true });
  });

  it("allows Staff only for their own linked Resource", async () => {
    const own = await fixture({ role: "staff", linkResourceToActor: true });
    await makeReady(own);
    expect(await own.create()).toMatchObject({ ok: true });

    const unrelated = await fixture({ role: "staff" });
    await makeReady(unrelated);
    expect(await unrelated.create()).toEqual({
      ok: false,
      reason: "insufficient_role",
    });
  });

  it("preserves Organization and Resource anti-leak ordering", async () => {
    const f = await fixture();
    const other = await fixture();
    await makeReady(f);
    expect(await f.create({ userId: randomUUID() })).toEqual({
      ok: false,
      reason: "organization_not_found",
    });
    expect(await f.create({ resourceId: other.resource.id })).toEqual({
      ok: false,
      reason: "resource_not_found",
    });
  });

  it.each([
    ["archived_at", "organization_archived"],
    ["suspended_at", "organization_suspended"],
  ] as const)("rejects an Organization with %s", async (column, reason) => {
    const f = await fixture();
    await makeReady(f);
    await db
      .updateTable("organization")
      .set({ [column]: new Date() })
      .where("id", "=", f.organization.id)
      .execute();
    expect(await f.create()).toEqual({ ok: false, reason });
  });

  it("rejects a deactivated Resource", async () => {
    const f = await fixture();
    await makeReady(f);
    await db
      .updateTable("resource")
      .set({ deactivated_at: new Date() })
      .where("id", "=", f.resource.id)
      .execute();
    expect(await f.create()).toEqual({
      ok: false,
      reason: "resource_inactive",
    });
  });

  it("distinguishes missing, inactive, and unassigned Services", async () => {
    const missing = await fixture();
    const other = await fixture();
    await makeReady(missing);
    expect(await missing.create({ serviceId: other.service.id })).toEqual({
      ok: false,
      reason: "service_not_found",
    });

    const inactive = await fixture();
    await makeReady(inactive);
    await db
      .updateTable("service")
      .set({ deactivated_at: new Date() })
      .where("id", "=", inactive.service.id)
      .execute();
    expect(await inactive.create()).toEqual({
      ok: false,
      reason: "service_inactive",
    });

    const unassigned = await fixture();
    await setMondayHours(unassigned, [{ startMinute: 540, endMinute: 720 }]);
    expect(await unassigned.create()).toEqual({
      ok: false,
      reason: "service_not_assigned",
    });
  });

  it.each([
    [{ date: "2026-02-30" }, "invalid_date"],
    [{ date: "2026-10-05T00:00:00Z" }, "invalid_date"],
    [{ startMinute: -1 }, "invalid_start_time"],
    [{ startMinute: 1440 }, "invalid_start_time"],
    [{ startMinute: 540.5 }, "invalid_start_time"],
    [{ guestName: "   " }, "invalid_guest_name"],
  ] as const)("rejects invalid input %j", async (overrides, reason) => {
    const f = await fixture();
    expect(await f.create(overrides)).toEqual({ ok: false, reason });
    expect(await db.selectFrom("booking").select("id").execute()).toEqual([]);
  });

  it.each([
    ["non-grid", 541],
    ["outside working hours", 480],
  ] as const)("rejects a %s start", async (_description, startMinute) => {
    const f = await fixture();
    await makeReady(f);
    expect(await f.create({ startMinute })).toEqual({
      ok: false,
      reason: "start_not_available",
    });
  });

  it("rejects a start covered by a Time Block", async () => {
    const f = await fixture();
    await makeReady(f);
    await db
      .insertInto("resource_time_block")
      .values({
        organization_id: f.organization.id,
        resource_id: f.resource.id,
        local_date: date,
        start_minute: 540,
        end_minute: 570,
      })
      .execute();
    expect(await f.create()).toEqual({
      ok: false,
      reason: "start_not_available",
    });
  });

  it.each([
    [90, 0, 540],
    [45, 15, 555],
  ] as const)(
    "rejects duration=%i buffer=%i when the start cannot fit",
    async (durationMinutes, bufferAfterMinutes, startMinute) => {
      const f = await fixture({ durationMinutes, bufferAfterMinutes });
      await makeReady(f, [{ startMinute: 540, endMinute: 600 }]);
      expect(await f.create({ startMinute })).toEqual({
        ok: false,
        reason: "start_not_available",
      });
    },
  );

  it("honors an Organization date closure", async () => {
    const f = await fixture();
    await makeReady(f);
    await db
      .insertInto("organization_date_override")
      .values({ organization_id: f.organization.id, local_date: date })
      .execute();
    expect(await f.create()).toEqual({
      ok: false,
      reason: "start_not_available",
    });
  });

  it("uses a Resource date override to open a slot", async () => {
    const f = await fixture();
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
    expect(await f.create({ startMinute: 600 })).toMatchObject({ ok: true });
  });

  it("uses an arbitrary Organization slot interval of 17", async () => {
    const f = await fixture({ slotIntervalMinutes: 17, durationMinutes: 15 });
    await makeReady(f, [{ startMinute: 550, endMinute: 650 }]);
    expect(await f.create({ startMinute: 567 })).toMatchObject({ ok: true });
    expect(await f.create({ startMinute: 568 })).toEqual({
      ok: false,
      reason: "start_not_available",
    });
  });

  it("keeps duration, buffer, and occupancy snapshots after Service edits", async () => {
    const f = await fixture({ durationMinutes: 45, bufferAfterMinutes: 15 });
    await makeReady(f);
    const result = await f.create();
    expect(result).toMatchObject({
      ok: true,
      booking: {
        durationMinutes: 45,
        bufferAfterMinutes: 15,
        serviceEndAt: "2026-10-05T06:45:00.000Z",
        occupiedUntilAt: "2026-10-05T07:00:00.000Z",
      },
    });
    await db
      .updateTable("service")
      .set({ duration_minutes: 30, buffer_after_minutes: 0 })
      .where("id", "=", f.service.id)
      .execute();
    expect(
      await db
        .selectFrom("booking")
        .select([
          "duration_minutes",
          "buffer_after_minutes",
          "service_end_at",
          "occupied_until_at",
        ])
        .executeTakeFirstOrThrow(),
    ).toEqual({
      duration_minutes: 45,
      buffer_after_minutes: 15,
      service_end_at: new Date("2026-10-05T06:45:00.000Z"),
      occupied_until_at: new Date("2026-10-05T07:00:00.000Z"),
    });
  });

  it.each([
    [false, null, null],
    [true, 5000, 5000],
    [true, 0, 0],
  ] as const)(
    "snapshots pricing enabled=%s Service price=%s as %s",
    async (pricingEnabled, priceAgorot, expected) => {
      const f = await fixture({ pricingEnabled, priceAgorot });
      await makeReady(f);
      const result = await f.create();
      expect(result).toMatchObject({
        ok: true,
        booking: { priceAgorot: expected },
      });
      if (!result.ok) throw new Error("Expected Booking creation to succeed");
      await db
        .updateTable("service")
        .set({ price_agorot: 9000 })
        .where("id", "=", f.service.id)
        .execute();
      expect(
        await db
          .selectFrom("booking")
          .select("price_agorot")
          .where("id", "=", result.booking.id)
          .executeTakeFirstOrThrow(),
      ).toEqual({ price_agorot: expected });
    },
  );

  it("creates different server-generated references for adjacent Bookings", async () => {
    const f = await fixture();
    await makeReady(f);
    const first = await f.create({ startMinute: 540 });
    const second = await f.create({ startMinute: 570 });
    if (!first.ok || !second.ok) throw new Error("Expected both Bookings");
    expect(first.booking.publicReference).not.toBe(
      second.booking.publicReference,
    );
  });

  it("maps an existing confirmed occupancy to booking_conflict", async () => {
    const f = await fixture();
    await makeReady(f);
    expect(await f.create()).toMatchObject({ ok: true });
    expect(await f.create()).toEqual({
      ok: false,
      reason: "booking_conflict",
    });
  });

  it("allows exactly one of two concurrent manual Booking attempts", async () => {
    const f = await fixture();
    await makeReady(f);
    const results = await Promise.all([f.create(), f.create()]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "booking_conflict" },
    ]);
    expect(
      await db
        .selectFrom("booking")
        .select("id")
        .where("resource_id", "=", f.resource.id)
        .where("status", "=", "confirmed")
        .execute(),
    ).toHaveLength(1);
  });
});
