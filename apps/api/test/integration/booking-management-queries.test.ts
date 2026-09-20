import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import type { BookingStatus, MembershipRole } from "../../src/db-types.js";
import {
  type ListManagementBookingsInput,
  listManagementBookings,
} from "../../src/modules/bookings/booking-query-service.js";
import {
  localBookingDateRangeToUtc,
  SCHEDULING_TIMEZONE,
} from "../../src/modules/bookings/booking-time.js";
import {
  addTestMembership,
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../helpers/factories.js";

const fromDate = "2026-10-05";
const toDate = "2026-10-07";

async function fixture(role: MembershipRole = "owner") {
  const actor = await createTestUser();
  const organization = await createTestOrganization();
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role,
  });
  const ownResource = await createTestResource({
    organizationId: organization.id,
    userId: role === "staff" ? actor.id : null,
    name: "Own resource",
  });
  const otherResource = await createTestResource({
    organizationId: organization.id,
    name: "Other resource",
  });
  const service = await createTestService({
    organizationId: organization.id,
    name: "Live service",
  });
  const input: ListManagementBookingsInput = {
    userId: actor.id,
    organizationId: organization.id,
    fromDate,
    toDate,
  };
  return {
    actor,
    organization,
    ownResource,
    otherResource,
    service,
    input,
    list: (overrides: Partial<ListManagementBookingsInput> = {}) =>
      listManagementBookings({ ...input, ...overrides }),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function addBooking(
  f: Fixture,
  {
    resourceId = f.ownResource.id,
    serviceId = f.service.id,
    startAt = new Date("2026-10-05T06:00:00.000Z"),
    status = "confirmed" as const,
    publicReference = `TEST-${randomUUID()}`,
    durationMinutes = 30,
    bufferAfterMinutes = 0,
    priceAgorot = null as number | null,
    cancelledAt = status === "cancelled"
      ? new Date("2026-10-04T12:00:00.000Z")
      : null,
    cancellationReason = null as string | null,
  }: {
    resourceId?: string;
    serviceId?: string;
    startAt?: Date;
    status?: BookingStatus;
    publicReference?: string;
    durationMinutes?: number;
    bufferAfterMinutes?: number;
    priceAgorot?: number | null;
    cancelledAt?: Date | null;
    cancellationReason?: string | null;
  } = {},
) {
  return createTestBooking({
    organizationId: f.organization.id,
    resourceId,
    serviceId,
    publicReference,
    status,
    startAt,
    durationMinutes,
    bufferAfterMinutes,
    priceAgorot,
    guestName: "Guest name",
    guestPhone: "050-123-4567",
    guestEmail: "guest@example.test",
    customerNote: "Customer note",
    cancelledAt,
    cancellationReason,
  });
}

function bookingIds(result: Awaited<ReturnType<Fixture["list"]>>) {
  if (!result.ok) throw new Error("Expected management Booking schedule");
  return result.schedule.bookings.map((booking) => booking.id);
}

describe("management Booking queries", () => {
  it.each(["owner", "manager"] as const)(
    "%s sees all Organization Resources' Bookings",
    async (role) => {
      const f = await fixture(role);
      const own = await addBooking(f);
      const other = await addBooking(f, {
        resourceId: f.otherResource.id,
        startAt: new Date("2026-10-05T07:00:00.000Z"),
      });
      const result = await f.list();
      expect(bookingIds(result)).toEqual([own.id, other.id]);
    },
  );

  it("Staff sees only their linked Resource and team visibility does not broaden scope", async () => {
    const f = await fixture("staff");
    await db
      .updateTable("organization")
      .set({ staff_team_visibility: "team" })
      .where("id", "=", f.organization.id)
      .execute();
    const own = await addBooking(f);
    await addBooking(f, {
      resourceId: f.otherResource.id,
      startAt: new Date("2026-10-05T07:00:00.000Z"),
    });
    expect(bookingIds(await f.list())).toEqual([own.id]);
  });

  it("returns an empty schedule for Staff without a linked Resource", async () => {
    const f = await fixture("staff");
    await db
      .updateTable("resource")
      .set({ user_id: null })
      .where("id", "=", f.ownResource.id)
      .execute();
    await addBooking(f);
    const result = await f.list();
    expect(result).toEqual({
      ok: true,
      schedule: {
        timezone: "Asia/Jerusalem",
        fromDate,
        toDate,
        bookings: [],
      },
    });
  });

  it("hides the Organization from a non-member before reading Bookings", async () => {
    const f = await fixture();
    await addBooking(f);
    expect(await f.list({ userId: randomUUID() })).toEqual({
      ok: false,
      reason: "organization_not_found",
    });
  });

  it("never includes cross-tenant Bookings", async () => {
    const f = await fixture();
    const visible = await addBooking(f);
    const other = await fixture();
    await addBooking(other);
    expect(bookingIds(await f.list())).toEqual([visible.id]);
  });

  it("uses inclusive local dates and half-open Asia/Jerusalem UTC boundaries", async () => {
    const f = await fixture();
    const range = localBookingDateRangeToUtc(fromDate, toDate);
    if (!range) throw new Error("Expected valid date range");
    const before = new Date(range.startAt.getTime() - 1);
    const first = await addBooking(f, { startAt: range.startAt });
    const middle = await addBooking(f, {
      resourceId: f.otherResource.id,
      startAt: new Date("2026-10-06T09:00:00.000Z"),
    });
    const last = await addBooking(f, {
      startAt: new Date(range.endExclusiveAt.getTime() - 30 * 60_000),
    });
    await addBooking(f, { startAt: before, status: "cancelled" });
    await addBooking(f, {
      startAt: range.endExclusiveAt,
      status: "cancelled",
    });
    expect(bookingIds(await f.list())).toEqual([first.id, middle.id, last.id]);
  });

  it("supports a same-local-day range without assuming UTC midnight", async () => {
    const f = await fixture();
    const inside = await addBooking(f, {
      startAt: new Date("2026-10-05T00:00:00.000Z"),
    });
    const result = await f.list({ toDate: fromDate });
    expect(bookingIds(result)).toEqual([inside.id]);
    if (!result.ok) throw new Error("Expected schedule");
    expect(result.schedule).toMatchObject({
      timezone: SCHEDULING_TIMEZONE,
      fromDate,
      toDate: fromDate,
    });
  });

  it("returns confirmed, cancelled, and no_show history with cancellation metadata", async () => {
    const f = await fixture();
    const confirmed = await addBooking(f);
    const cancelledAt = new Date("2026-10-04T12:00:00.000Z");
    const cancelled = await addBooking(f, {
      status: "cancelled",
      startAt: new Date("2026-10-05T07:00:00.000Z"),
      cancelledAt,
      cancellationReason: "Guest request",
    });
    const noShow = await addBooking(f, {
      status: "no_show",
      startAt: new Date("2026-10-05T08:00:00.000Z"),
    });
    const result = await f.list();
    if (!result.ok) throw new Error("Expected schedule");
    expect(
      result.schedule.bookings.map(({ id, status }) => ({ id, status })),
    ).toEqual([
      { id: confirmed.id, status: "confirmed" },
      { id: cancelled.id, status: "cancelled" },
      { id: noShow.id, status: "no_show" },
    ]);
    expect(result.schedule.bookings[1]).toMatchObject({
      cancelledAt: cancelledAt.toISOString(),
      cancellationReason: "Guest request",
    });
  });

  it("returns live names with historical snapshots for deactivated entities", async () => {
    const f = await fixture();
    const booking = await addBooking(f, {
      durationMinutes: 45,
      bufferAfterMinutes: 15,
      priceAgorot: 5000,
    });
    await db
      .updateTable("resource")
      .set({ name: "Renamed resource", deactivated_at: new Date() })
      .where("id", "=", f.ownResource.id)
      .execute();
    await db
      .updateTable("service")
      .set({
        name: "Renamed service",
        duration_minutes: 30,
        buffer_after_minutes: 0,
        price_agorot: 6000,
        deactivated_at: new Date(),
      })
      .where("id", "=", f.service.id)
      .execute();
    const result = await f.list();
    if (!result.ok) throw new Error("Expected schedule");
    expect(result.schedule.bookings).toEqual([
      expect.objectContaining({
        id: booking.id,
        resourceName: "Renamed resource",
        serviceName: "Renamed service",
        durationMinutes: 45,
        bufferAfterMinutes: 15,
        priceAgorot: 5000,
        serviceEndAt: "2026-10-05T06:45:00.000Z",
        occupiedUntilAt: "2026-10-05T07:00:00.000Z",
      }),
    ]);
    expect(result.schedule.bookings[0]).not.toHaveProperty("cancelledByUserId");
  });

  it("orders equal starts by Booking id", async () => {
    const f = await fixture();
    const first = await addBooking(f, { status: "no_show" });
    const second = await addBooking(f, { status: "cancelled" });
    expect(bookingIds(await f.list())).toEqual(
      [first.id, second.id].sort((left, right) => left.localeCompare(right)),
    );
  });

  it.each([{ archived_at: new Date() }, { suspended_at: new Date() }] as const)(
    "keeps lifecycle history readable for %j",
    async (state) => {
      const f = await fixture();
      await addBooking(f);
      await db
        .updateTable("organization")
        .set(state)
        .where("id", "=", f.organization.id)
        .execute();
      expect(bookingIds(await f.list())).toHaveLength(1);
    },
  );

  it.each([
    { fromDate: "not-a-date" },
    { toDate: "2026-02-30" },
    { fromDate: "2026-10-08", toDate: "2026-10-07" },
    { fromDate: "2026-10-05T00:00:00Z" },
  ] as const)("rejects invalid date range %j", async (overrides) => {
    const f = await fixture();
    expect(await f.list(overrides)).toEqual({
      ok: false,
      reason: "invalid_date_range",
    });
  });

  it("uses calendar-day boundaries across an actual DST transition", async () => {
    const f = await fixture();
    const transitionDate = "2026-03-27";
    const range = localBookingDateRangeToUtc(transitionDate, transitionDate);
    if (!range) throw new Error("Expected DST date range");
    expect(range.endExclusiveAt.getTime() - range.startAt.getTime()).not.toBe(
      24 * 60 * 60_000,
    );
    const localStart = DateTime.fromJSDate(range.startAt, {
      zone: SCHEDULING_TIMEZONE,
    });
    const localEnd = DateTime.fromJSDate(range.endExclusiveAt, {
      zone: SCHEDULING_TIMEZONE,
    });
    expect(localStart.toISODate()).toBe(transitionDate);
    expect(localStart.hour).toBe(0);
    expect(localEnd.toISODate()).toBe("2026-03-28");
    expect(localEnd.hour).toBe(0);

    const inside = await addBooking(f, { startAt: range.startAt });
    await addBooking(f, {
      startAt: range.endExclusiveAt,
      status: "cancelled",
    });
    expect(
      bookingIds(
        await f.list({ fromDate: transitionDate, toDate: transitionDate }),
      ),
    ).toEqual([inside.id]);
  });
});
