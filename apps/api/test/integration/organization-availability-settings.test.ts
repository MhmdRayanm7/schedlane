import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { Kysely } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import {
  down,
  up,
} from "../../src/migrations/0016_add_organization_slot_interval.js";
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
  it("uses the database default and accepts inclusive database bounds", async () => {
    const organization = await createTestOrganization();
    expect(organization.slot_interval_minutes).toBe(15);
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
  });

  it("backfills existing Organizations to 15 when the migration is reapplied", async () => {
    const organization = await createTestOrganization();
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await down(migrationDb);
      await up(migrationDb);
      const row = await trx
        .selectFrom("organization")
        .select("slot_interval_minutes")
        .where("id", "=", organization.id)
        .executeTakeFirstOrThrow();
      expect(row.slot_interval_minutes).toBe(15);
    });
  });

  it("gets defaults and lets Owners and Managers persist arbitrary valid intervals", async () => {
    const f = await fixture();
    expect((await f.request("GET")).json()).toEqual({
      slotIntervalMinutes: 15,
    });
    expect(
      (await f.request("PATCH", { slotIntervalMinutes: 17 })).json(),
    ).toEqual({ slotIntervalMinutes: 17 });
    expect((await f.request("GET")).json()).toEqual({
      slotIntervalMinutes: 17,
    });
    const manager = await createTestUser();
    await addTestMembership({
      organizationId: f.organization.id,
      userId: manager.id,
      role: "manager",
    });
    expect(
      (await f.request("PATCH", { slotIntervalMinutes: 1 }, manager.id)).json(),
    ).toEqual({ slotIntervalMinutes: 1 });
    expect(
      (
        await f.request("PATCH", { slotIntervalMinutes: 1440 }, manager.id)
      ).json(),
    ).toEqual({ slotIntervalMinutes: 1440 });
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
  ])("validates PATCH body %j", async (body, status) => {
    const f = await fixture();
    const response = await f.request("PATCH", body);
    expect(response.statusCode).toBe(status);
    if (status === 400)
      expect(response.json().code).toBe("INVALID_AVAILABILITY_SETTINGS");
  });
});
