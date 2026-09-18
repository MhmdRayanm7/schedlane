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
    });
    expect(
      (await f.request("PATCH", { slotIntervalMinutes: 17 })).json(),
    ).toEqual({
      slotIntervalMinutes: 17,
      minBookingNoticeMinutes: 0,
      maxBookingHorizonDays: 60,
      publicBookingPaused: false,
    });
    expect((await f.request("GET")).json()).toEqual({
      slotIntervalMinutes: 17,
      minBookingNoticeMinutes: 0,
      maxBookingHorizonDays: 60,
      publicBookingPaused: false,
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
  ])("validates PATCH body %j", async (body, status) => {
    const f = await fixture();
    const response = await f.request("PATCH", body);
    expect(response.statusCode).toBe(status);
    if (status === 400)
      expect(response.json().code).toBe("INVALID_AVAILABILITY_SETTINGS");
  });
});
