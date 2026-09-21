import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import type { BookingStatus } from "../../../src/db-types.js";
import type { MinuteInterval } from "../../../src/modules/availability/domain/minute-interval.js";
import {
  resolvePublicResourceServiceAvailability,
  resolvePublicResourceServiceAvailabilityInTransaction,
} from "../../../src/modules/availability/resolvers/public-resource-service-availability.js";
import {
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
} from "../../helpers/factories.js";

const date = "2026-10-05";
const now = new Date("2026-10-05T05:07:30.000Z");

type FixtureOptions = {
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  suspendedAt?: Date | null;
  publicBookingPaused?: boolean;
  minBookingNoticeMinutes?: number;
  maxBookingHorizonDays?: number;
  resourceDeactivatedAt?: Date | null;
  serviceDeactivatedAt?: Date | null;
  slotIntervalMinutes?: number;
  durationMinutes?: number;
};

async function fixture({
  publishedAt = new Date("2026-09-01T00:00:00.000Z"),
  archivedAt = null,
  suspendedAt = null,
  publicBookingPaused = false,
  minBookingNoticeMinutes = 0,
  maxBookingHorizonDays = 60,
  resourceDeactivatedAt = null,
  serviceDeactivatedAt = null,
  slotIntervalMinutes = 15,
  durationMinutes = 30,
}: FixtureOptions = {}) {
  const organization = await createTestOrganization({
    publishedAt,
    archivedAt,
    suspendedAt,
    publicBookingPaused,
    minBookingNoticeMinutes,
    maxBookingHorizonDays,
  });
  if (slotIntervalMinutes !== 15)
    await db
      .updateTable("organization")
      .set({ slot_interval_minutes: slotIntervalMinutes })
      .where("id", "=", organization.id)
      .execute();
  const resource = await createTestResource({
    organizationId: organization.id,
    deactivatedAt: resourceDeactivatedAt,
  });
  const service = await createTestService({
    organizationId: organization.id,
    durationMinutes,
    deactivatedAt: serviceDeactivatedAt,
  });
  const input = {
    organizationSlug: organization.slug,
    resourceId: resource.id,
    serviceId: service.id,
    date,
  };
  return {
    organization,
    resource,
    service,
    input,
    resolve: (overrides: Partial<typeof input> = {}, currentTime: Date = now) =>
      resolvePublicResourceServiceAvailability(
        { ...input, ...overrides },
        currentTime,
      ),
    success: (starts: number[], overrides: Partial<typeof input> = {}) => ({
      ok: true,
      availability: {
        timezone: "Asia/Jerusalem",
        organizationId: organization.id,
        organizationSlug: organization.slug,
        resourceId: overrides.resourceId ?? resource.id,
        serviceId: overrides.serviceId ?? service.id,
        date: overrides.date ?? date,
        starts,
      },
    }),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function configure(
  f: Fixture,
  {
    weekday = 1,
    intervals = [{ startMinute: 480, endMinute: 720 }],
    assign = true,
  }: {
    weekday?: number;
    intervals?: readonly MinuteInterval[];
    assign?: boolean;
  } = {},
) {
  if (intervals.length > 0)
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

async function addBooking(
  f: Fixture,
  status: BookingStatus,
  startAt = new Date("2026-10-05T07:00:00.000Z"),
  durationMinutes = 30,
) {
  return createTestBooking({
    organizationId: f.organization.id,
    resourceId: f.resource.id,
    serviceId: f.service.id,
    publicReference: randomUUID(),
    status,
    startAt,
    durationMinutes,
    bufferAfterMinutes: 0,
    cancelledAt:
      status === "cancelled" ? new Date("2026-10-04T18:00:00.000Z") : null,
  });
}

describe("public Resource-Service availability", () => {
  it("exposes the same starts and immutable snapshots to a caller-owned transaction", async () => {
    const f = await fixture({ durationMinutes: 45 });
    await configure(f);
    const wrapped = await f.resolve();
    const internal = await db
      .transaction()
      .setIsolationLevel("serializable")
      .execute((trx) =>
        resolvePublicResourceServiceAvailabilityInTransaction(
          trx,
          f.input,
          now,
        ),
      );
    if (!wrapped.ok || !internal.ok) throw new Error("Expected availability");
    expect(internal.context).toMatchObject({
      ...wrapped.availability,
      durationMinutes: 45,
      bufferAfterMinutes: 0,
      pricingEnabled: false,
      priceAgorot: null,
    });
  });

  it("resolves a published active assigned pairing without authentication", async () => {
    const f = await fixture();
    await configure(f);
    expect(await f.resolve()).toEqual(
      f.success([
        495, 510, 525, 540, 555, 570, 585, 600, 615, 630, 645, 660, 675, 690,
      ]),
    );
  });

  it.each([
    ["unpublished", { publishedAt: null }],
    ["archived", { publishedAt: null, archivedAt: new Date() }],
    ["suspended", { suspendedAt: new Date() }],
    ["paused", { publicBookingPaused: true }],
  ] as const)("hides a %s Organization", async (_state, options) => {
    const f = await fixture(options);
    await configure(f);
    expect(await f.resolve()).toEqual({
      ok: false,
      reason: "public_availability_not_found",
    });
  });

  it("requires an active tenant-scoped Resource", async () => {
    const f = await fixture({ resourceDeactivatedAt: new Date() });
    await configure(f);
    expect(await f.resolve()).toEqual({
      ok: false,
      reason: "resource_not_found",
    });
    expect(await f.resolve({ resourceId: randomUUID() })).toEqual({
      ok: false,
      reason: "resource_not_found",
    });
  });

  it("requires an active assigned Service", async () => {
    const inactive = await fixture({ serviceDeactivatedAt: new Date() });
    await configure(inactive);
    expect(await inactive.resolve()).toEqual({
      ok: false,
      reason: "service_not_found",
    });

    const unassigned = await fixture();
    await configure(unassigned, { assign: false });
    expect(await unassigned.resolve()).toEqual({
      ok: false,
      reason: "service_not_assigned",
    });
  });

  it("subtracts only confirmed Booking occupancy", async () => {
    const f = await fixture();
    await configure(f);
    await addBooking(f, "confirmed");
    await addBooking(f, "cancelled", new Date("2026-10-05T08:00:00.000Z"));
    await addBooking(f, "no_show", new Date("2026-10-05T09:00:00.000Z"));
    expect(await f.resolve()).toEqual(
      f.success([495, 510, 525, 540, 555, 570, 630, 645, 660, 675, 690]),
    );
  });

  it("composes Time Blocks before the public booking window", async () => {
    const f = await fixture();
    await configure(f);
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
    expect(await f.resolve()).toEqual(
      f.success([495, 510, 525, 540, 555, 615, 630, 645, 660, 675, 690]),
    );
  });

  it("applies notice zero to past starts and positive notice to near-term starts", async () => {
    const noNotice = await fixture();
    await configure(noNotice, {
      intervals: [{ startMinute: 480, endMinute: 570 }],
    });
    expect(await noNotice.resolve()).toEqual(
      noNotice.success([495, 510, 525, 540]),
    );

    const notice = await fixture({ minBookingNoticeMinutes: 30 });
    await configure(notice, {
      intervals: [{ startMinute: 480, endMinute: 570 }],
    });
    expect(await notice.resolve()).toEqual(notice.success([525, 540]));
  });

  it("treats horizon zero as today only", async () => {
    const f = await fixture({ maxBookingHorizonDays: 0 });
    await configure(f);
    expect((await f.resolve()).ok).toBe(true);
    expect(await f.resolve({ date: "2026-10-06" })).toEqual({
      ok: false,
      reason: "date_outside_booking_window",
    });
  });

  it("accepts the full final horizon day and rejects day 61", async () => {
    const f = await fixture({ maxBookingHorizonDays: 60 });
    await configure(f, {
      weekday: 5,
      intervals: [{ startMinute: 1080, endMinute: 1140 }],
    });
    const lastDate = { date: "2026-12-04" };
    expect(await f.resolve(lastDate)).toEqual(
      f.success([1080, 1095, 1110], lastDate),
    );
    expect(await f.resolve({ date: "2026-12-05" })).toEqual({
      ok: false,
      reason: "date_outside_booking_window",
    });
  });

  it("preserves an arbitrary interval-17 grid while subtracting occupancy", async () => {
    const f = await fixture({ slotIntervalMinutes: 17, durationMinutes: 20 });
    await configure(f, {
      intervals: [{ startMinute: 490, endMinute: 600 }],
    });
    await addBooking(f, "confirmed", new Date("2026-10-05T05:50:00.000Z"), 20);
    expect(await f.resolve()).toEqual(f.success([490, 507, 558, 575]));
  });

  it("omits individual DST-invalid starts", async () => {
    const f = await fixture({ slotIntervalMinutes: 30, durationMinutes: 15 });
    await configure(f, {
      weekday: 5,
      intervals: [{ startMinute: 60, endMinute: 240 }],
    });
    const override = { date: "2026-03-27" };
    expect(
      await f.resolve(override, new Date("2026-03-26T20:00:00.000Z")),
    ).toEqual(f.success([60, 90, 180, 210], override));
  });

  it("returns success with an empty valid day", async () => {
    const f = await fixture();
    await configure(f, { intervals: [] });
    expect(await f.resolve()).toEqual(f.success([]));
  });

  it("distinguishes invalid dates from dates outside the window", async () => {
    const f = await fixture();
    await configure(f);
    expect(await f.resolve({ date: "2026-02-30" })).toEqual({
      ok: false,
      reason: "invalid_date",
    });
    expect(await f.resolve({ date: "2026-10-04" })).toEqual({
      ok: false,
      reason: "date_outside_booking_window",
    });
  });
});
