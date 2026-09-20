import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { Kysely } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import {
  down as downSlotInterval,
  up as upSlotInterval,
} from "../../src/migrations/0016_add_organization_slot_interval.js";
import {
  down as downPublicSettings,
  up as upPublicSettings,
} from "../../src/migrations/0018_add_public_booking_availability_settings.js";
import {
  down as downGuestManagement,
  up as upGuestManagement,
} from "../../src/migrations/0019_add_guest_booking_management.js";
import { availabilityRoutes } from "../../src/modules/availability/availability-routes.js";
import {
  addTestMembership,
  createTestOrganization,
  createTestUser,
} from "../helpers/factories.js";

vi.mock("../../src/http/auth-guard.js", () => ({
  requireVerifiedUser: async (request: {
    headers: Record<string, string>;
    verifiedUser: unknown;
  }) => {
    request.verifiedUser = {
      id: request.headers["x-test-user"],
      email: "actor@example.test",
    };
  },
}));

const app = Fastify();
await app.register(availabilityRoutes);
afterAll(() => app.close());

async function fixture() {
  const owner = await createTestUser({ name: "Owner" });
  const organization = await createTestOrganization();
  await addTestMembership({
    organizationId: organization.id,
    userId: owner.id,
    role: "owner",
  });
  const request = (
    method: "GET" | "PATCH",
    payload?: object,
    userId = owner.id,
  ) =>
    app.inject({
      method,
      url: `/api/organizations/${organization.id}/availability/settings`,
      headers: { "x-test-user": userId },
      ...(payload === undefined ? {} : { payload }),
    });
  return { owner, organization, request };
}

describe("Organization Availability settings", () => {
  it("uses database defaults and enforces nonnegative public booking settings", async () => {
    const organization = await createTestOrganization();
    expect(organization.slot_interval_minutes).toBe(15);
    expect(organization.min_booking_notice_minutes).toBe(0);
    expect(organization.max_booking_horizon_days).toBe(60);
    expect(organization.public_booking_paused).toBe(false);
    expect(organization.cancellation_cutoff_minutes).toBe(0);
    for (const slot_interval_minutes of [1, 1440]) {
      await expect(
        db
          .updateTable("organization")
          .set({ slot_interval_minutes })
          .where("id", "=", organization.id)
          .execute(),
      ).resolves.toBeDefined();
    }
    for (const slot_interval_minutes of [0, 1441]) {
      await expect(
        db
          .updateTable("organization")
          .set({ slot_interval_minutes })
          .where("id", "=", organization.id)
          .execute(),
      ).rejects.toMatchObject({ code: "23514" });
    }
    await expect(
      db
        .updateTable("organization")
        .set({
          min_booking_notice_minutes: 23,
          max_booking_horizon_days: 91,
        })
        .where("id", "=", organization.id)
        .execute(),
    ).resolves.toBeDefined();
    for (const update of [
      { min_booking_notice_minutes: -1 },
      { max_booking_horizon_days: -1 },
      { cancellation_cutoff_minutes: -1 },
    ]) {
      await expect(
        db
          .updateTable("organization")
          .set(update)
          .where("id", "=", organization.id)
          .execute(),
      ).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("backfills cancellation policy and Booking credential storage defaults", async () => {
    const organization = await createTestOrganization();
    const resource = await db
      .insertInto("resource")
      .values({ organization_id: organization.id, name: "Resource" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const service = await db
      .insertInto("service")
      .values({
        organization_id: organization.id,
        name: "Service",
        duration_minutes: 30,
        display_order: 0,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("booking")
      .values({
        organization_id: organization.id,
        resource_id: resource.id,
        service_id: service.id,
        public_reference: `BK-${randomUUID()}`,
        start_at: new Date("2026-10-05T06:00:00Z"),
        service_end_at: new Date("2026-10-05T06:30:00Z"),
        occupied_until_at: new Date("2026-10-05T06:30:00Z"),
        duration_minutes: 30,
        buffer_after_minutes: 0,
        guest_name: "Guest",
      })
      .execute();
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await downGuestManagement(migrationDb);
      await upGuestManagement(migrationDb);
      expect(
        await trx
          .selectFrom("organization")
          .select("cancellation_cutoff_minutes")
          .where("id", "=", organization.id)
          .executeTakeFirstOrThrow(),
      ).toEqual({ cancellation_cutoff_minutes: 0 });
      expect(
        await trx
          .selectFrom("booking")
          .select([
            "cancellation_cutoff_minutes",
            "guest_management_token_hash",
          ])
          .executeTakeFirstOrThrow(),
      ).toEqual({
        cancellation_cutoff_minutes: 0,
        guest_management_token_hash: null,
      });
    });
  });

  it("backfills existing Organizations to slot interval 15 when migration 0016 is reapplied", async () => {
    const organization = await createTestOrganization();
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await downSlotInterval(migrationDb);
      await upSlotInterval(migrationDb);
      const row = await trx
        .selectFrom("organization")
        .select("slot_interval_minutes")
        .where("id", "=", organization.id)
        .executeTakeFirstOrThrow();
      expect(row.slot_interval_minutes).toBe(15);
    });
  });

  it("backfills existing Organizations with public booking defaults", async () => {
    const organization = await createTestOrganization();
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await downPublicSettings(migrationDb);
      await upPublicSettings(migrationDb);
      const row = await trx
        .selectFrom("organization")
        .select([
          "slot_interval_minutes",
          "min_booking_notice_minutes",
          "max_booking_horizon_days",
          "public_booking_paused",
        ])
        .where("id", "=", organization.id)
        .executeTakeFirstOrThrow();
      expect(row.slot_interval_minutes).toBe(15);
      expect(row.min_booking_notice_minutes).toBe(0);
      expect(row.max_booking_horizon_days).toBe(60);
      expect(row.public_booking_paused).toBe(false);
    });
  });

  it("gets defaults and lets Owners and Managers persist arbitrary valid intervals", async () => {
    const f = await fixture();
    expect((await f.request("GET")).json()).toEqual({
      slotIntervalMinutes: 15,
      minBookingNoticeMinutes: 0,
      maxBookingHorizonDays: 60,
      publicBookingPaused: false,
      cancellationCutoffMinutes: 0,
    });
    expect(
      (await f.request("PATCH", { slotIntervalMinutes: 17 })).json(),
    ).toEqual({
      slotIntervalMinutes: 17,
      minBookingNoticeMinutes: 0,
      maxBookingHorizonDays: 60,
      publicBookingPaused: false,
      cancellationCutoffMinutes: 0,
    });
    expect((await f.request("GET")).json()).toEqual({
      slotIntervalMinutes: 17,
      minBookingNoticeMinutes: 0,
      maxBookingHorizonDays: 60,
      publicBookingPaused: false,
      cancellationCutoffMinutes: 0,
    });
    const manager = await createTestUser();
    await addTestMembership({
      organizationId: f.organization.id,
      userId: manager.id,
      role: "manager",
    });
    expect(
      (await f.request("PATCH", { slotIntervalMinutes: 1 }, manager.id)).json(),
    ).toMatchObject({ slotIntervalMinutes: 1 });
    expect(
      (
        await f.request("PATCH", { slotIntervalMinutes: 1440 }, manager.id)
      ).json(),
    ).toMatchObject({ slotIntervalMinutes: 1440 });
  });

  it("partially updates one or several settings without changing omitted values", async () => {
    const f = await fixture();
    expect(
      (await f.request("PATCH", { minBookingNoticeMinutes: 30 })).json(),
    ).toEqual({
      slotIntervalMinutes: 15,
      minBookingNoticeMinutes: 30,
      maxBookingHorizonDays: 60,
      publicBookingPaused: false,
      cancellationCutoffMinutes: 0,
    });
    expect(
      (
        await f.request("PATCH", {
          slotIntervalMinutes: 17,
          maxBookingHorizonDays: 90,
        })
      ).json(),
    ).toEqual({
      slotIntervalMinutes: 17,
      minBookingNoticeMinutes: 30,
      maxBookingHorizonDays: 90,
      publicBookingPaused: false,
      cancellationCutoffMinutes: 0,
    });
    expect(
      (await f.request("PATCH", { publicBookingPaused: true })).json(),
    ).toMatchObject({ publicBookingPaused: true });
    expect(
      (
        await f.request("PATCH", {
          minBookingNoticeMinutes: 0,
          maxBookingHorizonDays: 0,
          publicBookingPaused: false,
        })
      ).json(),
    ).toEqual({
      slotIntervalMinutes: 17,
      minBookingNoticeMinutes: 0,
      maxBookingHorizonDays: 0,
      publicBookingPaused: false,
      cancellationCutoffMinutes: 0,
    });
    expect(
      (await f.request("PATCH", { maxBookingHorizonDays: 60 })).json(),
    ).toMatchObject({ maxBookingHorizonDays: 60 });
  });

  it("preserves authorization and readable archived/suspended settings", async () => {
    const f = await fixture();
    const staff = await createTestUser();
    await addTestMembership({
      organizationId: f.organization.id,
      userId: staff.id,
      role: "staff",
    });
    expect((await f.request("GET", undefined, staff.id)).statusCode).toBe(403);
    expect(
      (await f.request("PATCH", { slotIntervalMinutes: 17 }, staff.id))
        .statusCode,
    ).toBe(403);
    expect((await f.request("GET", undefined, randomUUID())).statusCode).toBe(
      404,
    );
    expect(
      (await f.request("PATCH", { slotIntervalMinutes: 17 }, randomUUID()))
        .statusCode,
    ).toBe(404);
    for (const state of ["archived_at", "suspended_at"] as const) {
      await db
        .updateTable("organization")
        .set({ [state]: new Date() })
        .where("id", "=", f.organization.id)
        .execute();
      expect((await f.request("GET")).statusCode).toBe(200);
      expect(
        (await f.request("PATCH", { slotIntervalMinutes: 17 })).statusCode,
      ).toBe(409);
      await db
        .updateTable("organization")
        .set({ [state]: null })
        .where("id", "=", f.organization.id)
        .execute();
    }
  });

  it.each([
    [{ slotIntervalMinutes: 1 }, 200],
    [{ slotIntervalMinutes: 1440 }, 200],
    [{ slotIntervalMinutes: 17 }, 200],
    [{ slotIntervalMinutes: 0 }, 400],
    [{ slotIntervalMinutes: 1441 }, 400],
    [{ slotIntervalMinutes: 1.5 }, 400],
    [{ slotIntervalMinutes: "15" }, 400],
    [{ slotIntervalMinutes: null }, 400],
    [{ slotIntervalMinutes: 15, extra: true }, 400],
    [{}, 400],
    [{ minBookingNoticeMinutes: -1 }, 400],
    [{ minBookingNoticeMinutes: 1.5 }, 400],
    [{ minBookingNoticeMinutes: "30" }, 400],
    [{ minBookingNoticeMinutes: null }, 400],
    [{ maxBookingHorizonDays: -1 }, 400],
    [{ maxBookingHorizonDays: 1.5 }, 400],
    [{ maxBookingHorizonDays: "60" }, 400],
    [{ maxBookingHorizonDays: null }, 400],
    [{ publicBookingPaused: "true" }, 400],
    [{ publicBookingPaused: null }, 400],
    [{ publicBookingPaused: false }, 200],
    [{ cancellationCutoffMinutes: 0 }, 200],
    [{ cancellationCutoffMinutes: 1440 }, 200],
    [{ cancellationCutoffMinutes: -1 }, 400],
    [{ cancellationCutoffMinutes: 1.5 }, 400],
    [{ cancellationCutoffMinutes: "60" }, 400],
    [{ cancellationCutoffMinutes: null }, 400],
  ])("validates PATCH body %j", async (body, status) => {
    const f = await fixture();
    const response = await f.request("PATCH", body);
    expect(response.statusCode).toBe(status);
    if (status === 400)
      expect(response.json().code).toBe("INVALID_AVAILABILITY_SETTINGS");
  });
});
