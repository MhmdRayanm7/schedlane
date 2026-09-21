import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import type { BookingStatus } from "../../../src/db-types.js";
import {
  createTestOrganization,
  createTestResource,
  createTestService,
} from "../../helpers/factories.js";

type Fixture = Awaited<ReturnType<typeof fixture>>;

type TemporalSnapshot = {
  startAt: Date;
  serviceEndAt: Date;
  occupiedUntilAt: Date;
  durationMinutes: number;
  bufferAfterMinutes: number;
};

const at = (time: string) => new Date(`2026-10-05T${time}:00.000Z`);

async function fixture() {
  const organization = await createTestOrganization();
  const resource = await createTestResource({
    organizationId: organization.id,
  });
  const service = await createTestService({
    organizationId: organization.id,
  });
  return { organization, resource, service };
}

function bookingValues(
  f: Fixture,
  temporal: TemporalSnapshot,
  status: BookingStatus = "confirmed",
) {
  return {
    organization_id: f.organization.id,
    resource_id: f.resource.id,
    service_id: f.service.id,
    public_reference: randomUUID(),
    status,
    start_at: temporal.startAt,
    service_end_at: temporal.serviceEndAt,
    occupied_until_at: temporal.occupiedUntilAt,
    duration_minutes: temporal.durationMinutes,
    buffer_after_minutes: temporal.bufferAfterMinutes,
    price_agorot: null,
    guest_name: "Conflict test guest",
    guest_phone: null,
    guest_email: null,
    customer_note: null,
    cancelled_at: status === "cancelled" ? at("05:00") : null,
    cancelled_by_user_id: null,
    cancellation_reason: null,
  };
}

const baseHour: TemporalSnapshot = {
  startAt: at("06:00"),
  serviceEndAt: at("07:00"),
  occupiedUntilAt: at("07:00"),
  durationMinutes: 60,
  bufferAfterMinutes: 0,
};

describe("Booking conflict constraints", () => {
  it.each([
    ["08:30-09:30", "05:30", "06:30", 60, true],
    ["09:00-09:30", "06:00", "06:30", 30, true],
    ["09:30-10:30", "06:30", "07:30", 60, true],
    ["09:59-10:30", "06:59", "07:30", 31, true],
    ["08:00-09:00", "05:00", "06:00", 60, false],
    ["10:00-10:30", "07:00", "07:30", 30, false],
    ["10:30-11:00", "07:30", "08:00", 30, false],
  ])(
    "treats %s as conflict=%s against the half-open 09:00-10:00 interval",
    async (_description, candidateStart, candidateEnd, durationMinutes, conflicts) => {
      const f = await fixture();
      await db
        .insertInto("booking")
        .values(bookingValues(f, baseHour))
        .execute();
      const startAt = at(candidateStart);
      const occupiedUntilAt = at(candidateEnd);
      const insert = db
        .insertInto("booking")
        .values(
          bookingValues(f, {
            startAt,
            serviceEndAt: occupiedUntilAt,
            occupiedUntilAt,
            durationMinutes,
            bufferAfterMinutes: 0,
          }),
        )
        .execute();

      if (conflicts) {
        await expect(insert).rejects.toMatchObject({
          code: "23P01",
          constraint: "booking_confirmed_resource_occupancy_excl",
        });
      } else {
        await expect(insert).resolves.toHaveLength(1);
      }
    },
  );

  it("reserves buffer_after while allowing a Booking at occupied_until", async () => {
    const f = await fixture();
    await db
      .insertInto("booking")
      .values(
        bookingValues(f, {
          startAt: at("06:00"),
          serviceEndAt: at("06:45"),
          occupiedUntilAt: at("07:00"),
          durationMinutes: 45,
          bufferAfterMinutes: 15,
        }),
      )
      .execute();

    await expect(
      db
        .insertInto("booking")
        .values(
          bookingValues(f, {
            startAt: at("06:45"),
            serviceEndAt: at("07:00"),
            occupiedUntilAt: at("07:00"),
            durationMinutes: 15,
            bufferAfterMinutes: 0,
          }),
        )
        .execute(),
    ).rejects.toMatchObject({
      code: "23P01",
      constraint: "booking_confirmed_resource_occupancy_excl",
    });
    await expect(
      db
        .insertInto("booking")
        .values(
          bookingValues(f, {
            startAt: at("07:00"),
            serviceEndAt: at("07:30"),
            occupiedUntilAt: at("07:30"),
            durationMinutes: 30,
            bufferAfterMinutes: 0,
          }),
        )
        .execute(),
    ).resolves.toHaveLength(1);
  });

  it("allows the same occupied interval on different Resources and Organizations", async () => {
    const first = await fixture();
    const secondResource = await createTestResource({
      organizationId: first.organization.id,
      name: "Second resource",
    });
    const other = await fixture();
    await db
      .insertInto("booking")
      .values([
        bookingValues(first, baseHour),
        bookingValues({ ...first, resource: secondResource }, baseHour),
        bookingValues(other, baseHour),
      ])
      .execute();
    expect(await db.selectFrom("booking").select("id").execute()).toHaveLength(
      3,
    );
  });

  it("allows confirmed overlap over an existing cancelled Booking", async () => {
    const f = await fixture();
    await db
      .insertInto("booking")
      .values(bookingValues(f, baseHour, "cancelled"))
      .execute();
    await expect(
      db.insertInto("booking").values(bookingValues(f, baseHour)).execute(),
    ).resolves.toHaveLength(1);
  });

  it("allows a new cancelled Booking to overlap a confirmed Booking", async () => {
    const f = await fixture();
    await db.insertInto("booking").values(bookingValues(f, baseHour)).execute();
    await expect(
      db
        .insertInto("booking")
        .values(bookingValues(f, baseHour, "cancelled"))
        .execute(),
    ).resolves.toHaveLength(1);
  });

  it("allows two cancelled Bookings to overlap", async () => {
    const f = await fixture();
    await db
      .insertInto("booking")
      .values([
        bookingValues(f, baseHour, "cancelled"),
        bookingValues(f, baseHour, "cancelled"),
      ])
      .execute();
    expect(await db.selectFrom("booking").select("id").execute()).toHaveLength(
      2,
    );
  });

  it("allows a no_show Booking to overlap a confirmed Booking", async () => {
    const f = await fixture();
    await db.insertInto("booking").values(bookingValues(f, baseHour)).execute();
    await expect(
      db
        .insertInto("booking")
        .values(bookingValues(f, baseHour, "no_show"))
        .execute(),
    ).resolves.toHaveLength(1);
  });

  it("rechecks conflicts when status changes to confirmed", async () => {
    const f = await fixture();
    const confirmed = await db
      .insertInto("booking")
      .values(bookingValues(f, baseHour))
      .returning("id")
      .executeTakeFirstOrThrow();
    const cancelled = await db
      .insertInto("booking")
      .values(
        bookingValues(
          f,
          {
            startAt: at("06:30"),
            serviceEndAt: at("07:30"),
            occupiedUntilAt: at("07:30"),
            durationMinutes: 60,
            bufferAfterMinutes: 0,
          },
          "cancelled",
        ),
      )
      .returning("id")
      .executeTakeFirstOrThrow();

    await expect(
      db
        .updateTable("booking")
        .set({
          status: "confirmed",
          cancelled_at: null,
          cancelled_by_user_id: null,
          cancellation_reason: null,
        })
        .where("id", "=", cancelled.id)
        .execute(),
    ).rejects.toMatchObject({
      code: "23P01",
      constraint: "booking_confirmed_resource_occupancy_excl",
    });

    await db
      .updateTable("booking")
      .set({ status: "cancelled", cancelled_at: at("08:00") })
      .where("id", "=", confirmed.id)
      .execute();
    await expect(
      db
        .updateTable("booking")
        .set({
          status: "confirmed",
          cancelled_at: null,
          cancelled_by_user_id: null,
          cancellation_reason: null,
        })
        .where("id", "=", cancelled.id)
        .execute(),
    ).resolves.toMatchObject([{ numUpdatedRows: 1n }]);
  });

  it("protects reschedule-like temporal updates", async () => {
    const f = await fixture();
    await db.insertInto("booking").values(bookingValues(f, baseHour)).execute();
    const second = await db
      .insertInto("booking")
      .values(
        bookingValues(f, {
          startAt: at("07:00"),
          serviceEndAt: at("08:00"),
          occupiedUntilAt: at("08:00"),
          durationMinutes: 60,
          bufferAfterMinutes: 0,
        }),
      )
      .returning("id")
      .executeTakeFirstOrThrow();

    await expect(
      db
        .updateTable("booking")
        .set({
          start_at: at("06:30"),
          service_end_at: at("07:30"),
          occupied_until_at: at("07:30"),
        })
        .where("id", "=", second.id)
        .execute(),
    ).rejects.toMatchObject({
      code: "23P01",
      constraint: "booking_confirmed_resource_occupancy_excl",
    });
    await expect(
      db
        .updateTable("booking")
        .set({
          start_at: at("08:00"),
          service_end_at: at("09:00"),
          occupied_until_at: at("09:00"),
        })
        .where("id", "=", second.id)
        .execute(),
    ).resolves.toMatchObject([{ numUpdatedRows: 1n }]);
  });

  it("allows exactly one overlapping confirmed insert across concurrent transactions", async () => {
    const f = await fixture();
    let releaseFirst: (() => void) | undefined;
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstInserted: (() => void) | undefined;
    const firstIsPending = new Promise<void>((resolve) => {
      firstInserted = resolve;
    });

    const firstTransaction = db.transaction().execute(async (trx) => {
      await trx
        .insertInto("booking")
        .values(bookingValues(f, baseHour))
        .execute();
      firstInserted?.();
      await holdFirst;
    });
    await firstIsPending;

    let secondAttempted: (() => void) | undefined;
    const secondQueryStarted = new Promise<void>((resolve) => {
      secondAttempted = resolve;
    });
    const secondTransaction = db
      .transaction()
      .execute(async (trx) => {
        const insert = trx
          .insertInto("booking")
          .values(bookingValues(f, baseHour))
          .execute();
        secondAttempted?.();
        await insert;
      })
      .then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    await secondQueryStarted;
    releaseFirst?.();

    await expect(firstTransaction).resolves.toBeUndefined();
    const secondResult = await secondTransaction;
    expect(secondResult).toMatchObject({
      ok: false,
      error: {
        code: "23P01",
        constraint: "booking_confirmed_resource_occupancy_excl",
      },
    });
    expect(await db.selectFrom("booking").select("id").execute()).toHaveLength(
      1,
    );
  });
});
