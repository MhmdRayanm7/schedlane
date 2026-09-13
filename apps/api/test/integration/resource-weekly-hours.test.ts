import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { type Kysely, sql } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import type { MembershipRole } from "../../src/db-types.js";
import {
  down,
  up,
} from "../../src/migrations/0012_create_resource_weekly_hours_overrides.js";
import { availabilityRoutes } from "../../src/modules/availability/availability-routes.js";
import type { ResourceWeeklyHoursDay } from "../../src/modules/availability/resource-weekly-hours.js";
import { replaceResourceWeeklyHours } from "../../src/modules/availability/resource-weekly-hours-service.js";

// Only authentication is stubbed; routes, authorization, transactions and PostgreSQL are real.
vi.mock("../../src/http/auth-guard.js", () => ({
  requireVerifiedUser: async (request: {
    headers: Record<string, string>;
    verifiedUser: unknown;
  }) => {
    request.verifiedUser = { id: request.headers["x-test-user"] };
  },
}));
const app = Fastify();
await app.register(availabilityRoutes);
afterAll(() => app.close());

function schedule(
  intervals: ResourceWeeklyHoursDay["intervals"] = [],
  weekday = 1,
): ResourceWeeklyHoursDay[] {
  return Array.from({ length: 7 }, (_, index) => ({
    weekday: index + 1,
    mode: index + 1 === weekday && intervals.length ? "custom" : "inherit",
    intervals: index + 1 === weekday ? intervals : [],
  }));
}
const initial = () =>
  schedule([
    { startMinute: 540, endMinute: 720 },
    { startMinute: 780, endMinute: 1080 },
  ]);

async function fixture() {
  const userId = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: userId,
      name: "Owner",
      email: `${userId}@example.test`,
      emailVerified: true,
      image: null,
    })
    .execute();
  const organization = await db
    .insertInto("organization")
    .values({
      slug: `weekly-${randomUUID()}`,
      name: "Weekly hours organization",
      published_at: null,
      archived_at: null,
      suspended_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const organizationId = organization.id;
  await db
    .insertInto("membership")
    .values({ organization_id: organizationId, user_id: userId, role: "owner" })
    .execute();
  const resource = await db
    .insertInto("resource")
    .values({
      organization_id: organizationId,
      user_id: null,
      name: "Resource",
      deactivated_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const resourceId = resource.id;
  const request = (
    method: "GET" | "PUT",
    payload?: object,
    actorId = userId,
    targetId = organizationId,
    targetResourceId = resourceId,
  ) =>
    app.inject({
      method,
      url: `/api/organizations/${targetId}/resources/${targetResourceId}/availability/weekly-hours`,
      headers: { "x-test-user": actorId },
      ...(payload === undefined ? {} : { payload }),
    });
  const read = async () => ({
    overrides: await db
      .selectFrom("resource_weekly_hours_override")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("resource_id", "=", resourceId)
      .orderBy("weekday")
      .execute(),
    intervals: await db
      .selectFrom("resource_weekly_hours_interval")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("resource_id", "=", resourceId)
      .orderBy("weekday")
      .orderBy("start_minute")
      .execute(),
  });
  const role = (role: MembershipRole) =>
    db
      .updateTable("membership")
      .set({ role })
      .where("user_id", "=", userId)
      .execute();
  return { userId, organizationId, resourceId, request, read, role };
}

describe("Resource weekly hours overrides", () => {
  it("defaults to seven inherited days without materializing Organization hours", async () => {
    const f = await fixture();
    await db
      .insertInto("organization_weekly_hours")
      .values({
        organization_id: f.organizationId,
        weekday: 1,
        start_minute: 540,
        end_minute: 1020,
      })
      .execute();
    const response = await f.request("GET");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      timezone: "Asia/Jerusalem",
      resourceId: f.resourceId,
      days: schedule(),
    });
    expect(await f.read()).toEqual({ overrides: [], intervals: [] });
  });

  it("normalizes all three modes, stores closed/custom distinctly, and removes overrides returned to inherit", async () => {
    const f = await fixture();
    const days = initial();
    days[1] = { weekday: 2, mode: "closed", intervals: [] };
    const expected = structuredClone(days);
    days[0]?.intervals.reverse();
    days.reverse();
    const response = await f.request("PUT", { days });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      timezone: "Asia/Jerusalem",
      resourceId: f.resourceId,
      days: expected,
    });
    expect((await f.request("GET")).json()).toEqual(response.json());
    const stored = await f.read();
    expect(stored.overrides).toEqual(
      [1, 2].map((weekday) => ({
        organization_id: f.organizationId,
        resource_id: f.resourceId,
        weekday,
      })),
    );
    expect(stored.intervals).toEqual(
      initial()[0]?.intervals.map((interval) => ({
        organization_id: f.organizationId,
        resource_id: f.resourceId,
        weekday: 1,
        start_minute: interval.startMinute,
        end_minute: interval.endMinute,
      })),
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await f.request("PUT", { days: schedule() })).statusCode).toBe(
        200,
      );
      expect(await f.read()).toEqual({ overrides: [], intervals: [] });
    }
  });

  it.each([
    ["owner", "owner", true],
    ["owner", "manager", true],
    ["owner", "staff", true],
    ["owner", "unlinked", true],
    ["manager", "unlinked", true],
    ["manager", "staff", true],
    ["manager", "owner", false],
    ["manager", "manager", false],
    ["staff", "self", true],
    ["staff", "staff", false],
    ["staff", "unlinked", false],
    ["staff", "owner", false],
    ["staff", "manager", false],
  ] as const)(
    "%s managing %s resource: allowed=%s for GET and PUT",
    async (actorRole, linkedRole, allowed) => {
      const f = await fixture();
      await f.request("PUT", { days: initial() });
      await f.role(actorRole);
      if (linkedRole !== "unlinked") {
        let linkedUserId = f.userId;
        if (linkedRole !== "self") {
          const linked = await fixture();
          linkedUserId = linked.userId;
          await db
            .insertInto("membership")
            .values({
              organization_id: f.organizationId,
              user_id: linkedUserId,
              role: linkedRole,
            })
            .execute();
        }
        await db
          .updateTable("resource")
          .set({ user_id: linkedUserId })
          .where("id", "=", f.resourceId)
          .execute();
      }
      const before = await f.read();
      for (const method of ["GET", "PUT"] as const) {
        const response = await f.request(
          method,
          method === "PUT" ? { days: schedule() } : undefined,
        );
        expect(response.statusCode).toBe(allowed ? 200 : 403);
        if (!allowed) {
          expect(response.json()).toMatchObject({
            code: "AVAILABILITY_MANAGEMENT_NOT_ALLOWED",
            requestId: expect.any(String),
          });
          expect(await f.read()).toEqual(before);
        }
      }
    },
  );

  it.each(["GET", "PUT"] as const)(
    "hides non-member Organizations and foreign/missing Resources for %s",
    async (method) => {
      const f = await fixture();
      const other = await fixture();
      const payload = method === "PUT" ? { days: initial() } : undefined;
      for (const targetId of [other.organizationId, randomUUID()]) {
        const response = await f.request(method, payload, f.userId, targetId);
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe("ORGANIZATION_NOT_FOUND");
      }
      for (const resourceId of [other.resourceId, randomUUID()]) {
        const response = await f.request(
          method,
          payload,
          f.userId,
          f.organizationId,
          resourceId,
        );
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe("RESOURCE_NOT_FOUND");
      }
    },
  );

  it("edits deactivated Resources without changing lifecycle or publication", async () => {
    const f = await fixture();
    const now = new Date();
    await db
      .updateTable("resource")
      .set({ deactivated_at: now })
      .where("id", "=", f.resourceId)
      .execute();
    await db
      .updateTable("organization")
      .set({ published_at: now })
      .where("id", "=", f.organizationId)
      .execute();
    const before = await db
      .selectFrom("resource")
      .selectAll()
      .where("id", "=", f.resourceId)
      .executeTakeFirstOrThrow();
    expect((await f.request("PUT", { days: initial() })).statusCode).toBe(200);
    expect((await f.request("GET")).json().days).toEqual(initial());
    expect(
      await db
        .selectFrom("resource")
        .selectAll()
        .where("id", "=", f.resourceId)
        .executeTakeFirstOrThrow(),
    ).toEqual(before);
    expect(
      (
        await db
          .selectFrom("organization")
          .select("published_at")
          .where("id", "=", f.organizationId)
          .executeTakeFirstOrThrow()
      ).published_at,
    ).toEqual(now);
  });

  it.each(["archived", "suspended"] as const)(
    "rejects %s writes, preserves both tables and allows reads",
    async (state) => {
      const f = await fixture();
      await f.request("PUT", { days: initial() });
      const before = await f.read();
      await db
        .updateTable("organization")
        .set(
          state === "archived"
            ? { archived_at: new Date() }
            : { suspended_at: new Date() },
        )
        .where("id", "=", f.organizationId)
        .execute();
      const response = await f.request("PUT", { days: schedule() });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe(`ORGANIZATION_${state.toUpperCase()}`);
      expect(await f.read()).toEqual(before);
      const get = await f.request("GET");
      expect(get.statusCode).toBe(200);
      expect(get.json().days).toEqual(initial());
    },
  );
  const invalidSchedules: Array<[string, ResourceWeeklyHoursDay[]]> = [
    ["missing weekday", schedule().slice(1)],
    [
      "extra weekday",
      [...schedule(), { weekday: 1, mode: "inherit", intervals: [] }],
    ],
    [
      "duplicate weekday",
      schedule().map((day) => ({
        ...day,
        weekday: day.weekday === 7 ? 1 : day.weekday,
      })),
    ],
    ["equal endpoints", schedule([{ startMinute: 600, endMinute: 600 }])],
    ["reversed endpoints", schedule([{ startMinute: 900, endMinute: 600 }])],
    [
      "overlap",
      schedule([
        { startMinute: 540, endMinute: 720 },
        { startMinute: 700, endMinute: 800 },
      ]),
    ],
    [
      "contained interval",
      schedule([
        { startMinute: 540, endMinute: 900 },
        { startMinute: 600, endMinute: 700 },
      ]),
    ],
    [
      "duplicate interval",
      schedule([
        { startMinute: 540, endMinute: 720 },
        { startMinute: 540, endMinute: 720 },
      ]),
    ],
    [
      "weekday zero",
      schedule().map((day) => ({ ...day, weekday: day.weekday - 1 })),
    ],
    [
      "weekday eight",
      schedule().map((day) => ({ ...day, weekday: day.weekday + 1 })),
    ],
    [
      "fractional weekday",
      schedule().map((day) => ({ ...day, weekday: day.weekday + 0.5 })),
    ],
    ["negative start", schedule([{ startMinute: -1, endMinute: 720 }])],
    ["start at 1440", schedule([{ startMinute: 1440, endMinute: 1440 }])],
    ["zero end", schedule([{ startMinute: 0, endMinute: 0 }])],
    ["end after 1440", schedule([{ startMinute: 540, endMinute: 1441 }])],
    ["fractional start", schedule([{ startMinute: 540.5, endMinute: 720 }])],
    ["fractional end", schedule([{ startMinute: 540, endMinute: 720.5 }])],
  ];
  it.each(invalidSchedules)(
    "rejects %s at HTTP and business boundaries without changing stored hours",
    async (_name, days) => {
      const f = await fixture();
      await f.request("PUT", { days: initial() });
      const before = await f.read();
      const response = await f.request("PUT", { days });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        code: "INVALID_WEEKLY_HOURS",
        message: "Weekly hours contain invalid or overlapping intervals",
        requestId: expect.any(String),
      });
      expect(await replaceResourceWeeklyHours({ ...f, days })).toEqual({
        ok: false,
        reason: "invalid_weekly_hours",
      });
      expect(await f.read()).toEqual(before);
    },
  );

  it.each([
    ...["inherit", "closed"].map((mode) => ({
      days: initial().map((day) => ({ ...day, mode })),
    })),
    { days: schedule().map((day) => ({ ...day, mode: "custom" })) },
    { days: schedule().map((day) => ({ ...day, mode: "invalid" })) },
    {},
    { days: null },
    { days: "invalid" },
    { days: schedule(), timezone: "UTC" },
    { days: schedule().map((day) => ({ ...day, intervals: null })) },
    ...[null, false, "0"].map((startMinute) => ({
      days: initial().map((day) => ({
        ...day,
        intervals: [{ startMinute, endMinute: 720 }],
      })),
    })),
  ])(
    "rejects invalid mode combinations and malformed inputs %j",
    async (payload) => {
      const f = await fixture();
      await f.request("PUT", { days: initial() });
      const before = await f.read();
      const response = await f.request("PUT", payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "INVALID_WEEKLY_HOURS",
        requestId: expect.any(String),
      });
      expect(await f.read()).toEqual(before);
    },
  );

  it("accepts adjacent intervals and midnight bounds", async () => {
    const f = await fixture();
    const days = schedule([
      { startMinute: 0, endMinute: 720 },
      { startMinute: 720, endMinute: 1440 },
    ]);
    expect((await f.request("PUT", { days })).statusCode).toBe(200);
    expect((await f.request("GET")).json().days).toEqual(days);
  });

  it("rolls back both tables after an interval insert fails", async () => {
    const f = await fixture();
    const days = initial();
    days[1] = { weekday: 2, mode: "closed", intervals: [] };
    await f.request("PUT", { days });
    const before = await f.read();
    await sql`ALTER TABLE resource_weekly_hours_interval ADD CONSTRAINT test_insert_failure CHECK (end_minute <> 1001)`.execute(
      db,
    );
    try {
      const response = await f.request("PUT", {
        days: schedule([{ startMinute: 600, endMinute: 1001 }], 3),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        code: "INVALID_WEEKLY_HOURS",
        message: "Weekly hours contain invalid or overlapping intervals",
        requestId: expect.any(String),
      });
      expect(await f.read()).toEqual(before);
      expect((await f.request("GET")).json().days).toEqual(days);
    } finally {
      await sql`ALTER TABLE resource_weekly_hours_interval DROP CONSTRAINT test_insert_failure`.execute(
        db,
      );
    }
  });

  it("enforces overlap, adjacency and tenant/parent foreign keys in PostgreSQL", async () => {
    const f = await fixture();
    const other = await fixture();
    const parent = {
      organization_id: f.organizationId,
      resource_id: f.resourceId,
      weekday: 1,
    };
    await db
      .insertInto("resource_weekly_hours_override")
      .values(parent)
      .execute();
    const row = { ...parent, start_minute: 540, end_minute: 720 };
    await db.insertInto("resource_weekly_hours_interval").values(row).execute();
    await expect(
      db
        .insertInto("resource_weekly_hours_interval")
        .values({ ...row, start_minute: 600, end_minute: 780 })
        .execute(),
    ).rejects.toMatchObject({
      code: "23P01",
      constraint: "resource_weekly_hours_no_overlap",
    });
    await db
      .insertInto("resource_weekly_hours_interval")
      .values({ ...row, start_minute: 720, end_minute: 900 })
      .execute();
    await expect(
      db
        .insertInto("resource_weekly_hours_override")
        .values({ ...parent, organization_id: other.organizationId })
        .execute(),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "resource_weekly_hours_override_resource_organization_fk",
    });
    await expect(
      db
        .insertInto("resource_weekly_hours_interval")
        .values({ ...row, weekday: 2 })
        .execute(),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "resource_weekly_hours_interval_override_fk",
    });
    await expect(
      db
        .insertInto("resource_weekly_hours_interval")
        .values({ ...row, organization_id: other.organizationId })
        .execute(),
    ).rejects.toMatchObject({ code: "23503" });
    expect((await f.read()).intervals).toHaveLength(2);
  });

  it.each([
    { start_minute: -1 },
    { start_minute: 1440, end_minute: 1440 },
    { end_minute: 0 },
    { end_minute: 1441 },
    { start_minute: 600, end_minute: 600 },
  ])("enforces SQL minute bounds %j", async (values) => {
    const f = await fixture();
    const parent = {
      organization_id: f.organizationId,
      resource_id: f.resourceId,
      weekday: 1,
    };
    await db
      .insertInto("resource_weekly_hours_override")
      .values(parent)
      .execute();
    await expect(
      db
        .insertInto("resource_weekly_hours_interval")
        .values({ ...parent, start_minute: 540, end_minute: 720, ...values })
        .execute(),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it.each([0, 8])(
    "enforces SQL weekday bounds %s in both tables",
    async (weekday) => {
      const f = await fixture();
      const parent = {
        organization_id: f.organizationId,
        resource_id: f.resourceId,
        weekday,
      };
      await expect(
        db
          .insertInto("resource_weekly_hours_override")
          .values(parent)
          .execute(),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        db
          .insertInto("resource_weekly_hours_interval")
          .values({ ...parent, start_minute: 0, end_minute: 1440 })
          .execute(),
      ).rejects.toMatchObject({ code: "23514" });
    },
  );

  it("serializes concurrent replacements into one complete configuration", async () => {
    const f = await fixture();
    const manager = await fixture();
    await db
      .insertInto("membership")
      .values({
        organization_id: f.organizationId,
        user_id: manager.userId,
        role: "manager",
      })
      .execute();
    const first = initial();
    const second = schedule([{ startMinute: 600, endMinute: 900 }], 3);
    second[0] = { weekday: 1, mode: "closed", intervals: [] };
    const results = await Promise.all([
      replaceResourceWeeklyHours({ ...f, days: first }),
      replaceResourceWeeklyHours({
        ...f,
        userId: manager.userId,
        days: second,
      }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect([first, second]).toContainEqual(
      (await f.request("GET")).json().days,
    );
  });

  it("cascades both tables on Resource deletion", async () => {
    const f = await fixture();
    await f.request("PUT", { days: initial() });
    await db.deleteFrom("resource").where("id", "=", f.resourceId).execute();
    expect(await f.read()).toEqual({ overrides: [], intervals: [] });
  });

  it("reverses and reapplies migration 0012 while preserving its Resource", async () => {
    const f = await fixture();
    await f.request("PUT", { days: initial() });
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await down(migrationDb);
      const { rows } = await sql<{
        parent: string | null;
        child: string | null;
      }>`SELECT to_regclass('resource_weekly_hours_override')::text AS parent, to_regclass('resource_weekly_hours_interval')::text AS child`.execute(
        trx,
      );
      expect(rows[0]).toEqual({ parent: null, child: null });
      expect(
        await trx
          .selectFrom("resource")
          .select("id")
          .where("id", "=", f.resourceId)
          .executeTakeFirst(),
      ).toEqual({ id: f.resourceId });
      await up(migrationDb);
    });
    expect((await f.request("PUT", { days: initial() })).statusCode).toBe(200);
  });
});
