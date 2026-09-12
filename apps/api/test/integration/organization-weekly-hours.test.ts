import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { type Kysely, sql } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import type { MembershipRole } from "../../src/db-types.js";
import {
  down,
  up,
} from "../../src/migrations/0011_create_organization_weekly_hours.js";
import { availabilityRoutes } from "../../src/modules/availability/availability-routes.js";
import { replaceOrganizationWeeklyHours } from "../../src/modules/availability/availability-service.js";
import type { WeeklyHoursDay } from "../../src/modules/availability/weekly-hours.js";

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
  intervals: WeeklyHoursDay["intervals"] = [],
  weekday = 1,
): WeeklyHoursDay[] {
  return Array.from({ length: 7 }, (_, index) => ({
    weekday: index + 1,
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
  const request = (
    method: "GET" | "PUT",
    payload?: object,
    actorId = userId,
    targetId = organizationId,
  ) =>
    app.inject({
      method,
      url: `/api/organizations/${targetId}/availability/weekly-hours`,
      headers: { "x-test-user": actorId },
      ...(payload === undefined ? {} : { payload }),
    });
  const read = () =>
    db
      .selectFrom("organization_weekly_hours")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("weekday")
      .orderBy("start_minute")
      .execute();
  const role = (role: MembershipRole) =>
    db
      .updateTable("membership")
      .set({ role })
      .where("user_id", "=", userId)
      .execute();
  return { userId, organizationId, request, read, role };
}

describe("Organization weekly hours", () => {
  it("returns seven closed days without creating rows before setup", async () => {
    const f = await fixture();
    const response = await f.request("GET");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      timezone: "Asia/Jerusalem",
      days: schedule(),
    });
    expect(await f.read()).toEqual([]);
  });

  it("lets an Owner set multiple intervals, normalizes input order, and returns every day", async () => {
    const f = await fixture();
    const days = initial();
    days[0]?.intervals.reverse();
    days.reverse();
    const response = await f.request("PUT", { days });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      timezone: "Asia/Jerusalem",
      days: initial(),
    });
    expect((await f.request("GET")).json()).toEqual(response.json());
    expect(await f.read()).toEqual([
      {
        organization_id: f.organizationId,
        weekday: 1,
        start_minute: 540,
        end_minute: 720,
      },
      {
        organization_id: f.organizationId,
        weekday: 1,
        start_minute: 780,
        end_minute: 1080,
      },
    ]);
  });

  it("lets a Manager read and replace the complete schedule idempotently", async () => {
    const f = await fixture();
    expect((await f.request("PUT", { days: initial() })).statusCode).toBe(200);
    await f.role("manager");
    const days = schedule([{ startMinute: 600, endMinute: 900 }], 7);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await f.request("PUT", { days });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ timezone: "Asia/Jerusalem", days });
      expect((await f.request("GET")).json()).toEqual(response.json());
      expect(await f.read()).toEqual([
        {
          organization_id: f.organizationId,
          weekday: 7,
          start_minute: 600,
          end_minute: 900,
        },
      ]);
    }
  });

  it.each(["GET", "PUT"] as const)(
    "rejects Staff %s without changing persistence",
    async (method) => {
      const f = await fixture();
      await f.request("PUT", { days: initial() });
      const before = await f.read();
      await f.role("staff");
      const response = await f.request(
        method,
        method === "PUT" ? { days: schedule() } : undefined,
      );
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "AVAILABILITY_MANAGEMENT_NOT_ALLOWED",
        requestId: expect.any(String),
      });
      expect(await f.read()).toEqual(before);
    },
  );

  it.each(["GET", "PUT"] as const)(
    "hides another or missing Organization for %s",
    async (method) => {
      const f = await fixture();
      const other = await fixture();
      await other.request("PUT", { days: initial() });
      const before = await other.read();
      for (const organizationId of [other.organizationId, randomUUID()]) {
        const response = await f.request(
          method,
          method === "PUT" ? { days: schedule() } : undefined,
          f.userId,
          organizationId,
        );
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe("ORGANIZATION_NOT_FOUND");
      }
      expect(await other.read()).toEqual(before);
      expect(await f.read()).toEqual([]);
    },
  );

  it.each(["archived", "suspended"] as const)(
    "preserves existing hours in an %s Organization and allows management reads",
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
      expect(get.json()).toEqual({
        timezone: "Asia/Jerusalem",
        days: initial(),
      });
    },
  );

  it.each([false, true])(
    "allows all-empty hours with published=%s and stores no closed-day rows",
    async (published) => {
      const f = await fixture();
      await f.request("PUT", { days: initial() });
      await db
        .updateTable("organization")
        .set({ published_at: published ? new Date() : null })
        .where("id", "=", f.organizationId)
        .execute();
      const response = await f.request("PUT", { days: schedule() });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        timezone: "Asia/Jerusalem",
        days: schedule(),
      });
      expect(await f.read()).toEqual([]);
    },
  );

  it("accepts adjacent intervals, midnight endpoints, and separate intervals across days", async () => {
    const f = await fixture();
    const days = schedule([
      { startMinute: 0, endMinute: 720 },
      { startMinute: 720, endMinute: 1440 },
    ]);
    days[1] = { weekday: 2, intervals: [{ startMinute: 0, endMinute: 120 }] };
    const response = await f.request("PUT", { days });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ timezone: "Asia/Jerusalem", days });
    expect(await f.read()).toHaveLength(3);
  });

  const invalidSchedules: Array<[string, WeeklyHoursDay[]]> = [
    ["missing weekday", schedule().slice(1)],
    ["extra weekday", [...schedule(), { weekday: 1, intervals: [] }]],
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
      expect(await replaceOrganizationWeeklyHours({ ...f, days })).toEqual({
        ok: false,
        reason: "invalid_weekly_hours",
      });
      expect(await f.read()).toEqual(before);
    },
  );

  it.each([
    {},
    { days: null },
    { days: "invalid" },
    { days: schedule(), timezone: "UTC" },
    { days: schedule().map((day) => ({ ...day, timezone: "UTC" })) },
    { days: schedule().map((day) => ({ ...day, intervals: null })) },
    ...[null, false, "0"].map((startMinute) => ({
      days: schedule().map((day) => ({
        ...day,
        intervals: [{ startMinute, endMinute: 720 }],
      })),
    })),
    {
      days: schedule().map((day) => ({
        ...day,
        intervals: [{ startMinute: 540, endMinute: 720, id: randomUUID() }],
      })),
    },
  ])("rejects malformed or unexpected body fields %j", async (payload) => {
    const f = await fixture();
    await f.request("PUT", { days: initial() });
    const before = await f.read();
    const response = await f.request("PUT", payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_WEEKLY_HOURS");
    expect(await f.read()).toEqual(before);
  });

  it("rolls back a deleted schedule when the bulk insert fails and hides constraint details", async () => {
    const f = await fixture();
    await f.request("PUT", { days: initial() });
    const before = await f.read();
    // Inject a real PostgreSQL insert failure after application validation succeeds.
    await sql`ALTER TABLE organization_weekly_hours ADD CONSTRAINT test_insert_failure CHECK (end_minute <> 1001)`.execute(
      db,
    );
    try {
      const response = await f.request("PUT", {
        days: schedule([{ startMinute: 600, endMinute: 1001 }]),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        code: "INVALID_WEEKLY_HOURS",
        message: "Weekly hours contain invalid or overlapping intervals",
        requestId: expect.any(String),
      });
      expect(await f.read()).toEqual(before);
    } finally {
      await sql`ALTER TABLE organization_weekly_hours DROP CONSTRAINT test_insert_failure`.execute(
        db,
      );
    }
  });

  it("serializes concurrent replacements by different actors into a complete schedule", async () => {
    const f = await fixture();
    const manager = await fixture();
    await db
      .insertInto("membership")
      .values({
        user_id: manager.userId,
        organization_id: f.organizationId,
        role: "manager",
      })
      .execute();
    const first = initial();
    const second = schedule([{ startMinute: 600, endMinute: 900 }], 3);
    const results = await Promise.all([
      replaceOrganizationWeeklyHours({ ...f, days: first }),
      replaceOrganizationWeeklyHours({
        ...f,
        userId: manager.userId,
        days: second,
      }),
    ]);
    expect(results).toEqual([
      { ok: true, weeklyHours: { timezone: "Asia/Jerusalem", days: first } },
      { ok: true, weeklyHours: { timezone: "Asia/Jerusalem", days: second } },
    ]);
    const stored = (await f.request("GET")).json();
    expect([
      { timezone: "Asia/Jerusalem", days: first },
      { timezone: "Asia/Jerusalem", days: second },
    ]).toContainEqual(stored);
  });

  it("rejects direct SQL overlap through the exclusion constraint while allowing adjacency, other days and tenants", async () => {
    const f = await fixture();
    const other = await fixture();
    const row = {
      organization_id: f.organizationId,
      weekday: 1,
      start_minute: 540,
      end_minute: 720,
    };
    await db.insertInto("organization_weekly_hours").values(row).execute();
    await expect(
      db
        .insertInto("organization_weekly_hours")
        .values({ ...row, start_minute: 600, end_minute: 780 })
        .execute(),
    ).rejects.toMatchObject({
      code: "23P01",
      constraint: "organization_weekly_hours_no_overlap",
    });
    await db
      .insertInto("organization_weekly_hours")
      .values([
        { ...row, start_minute: 720, end_minute: 900 },
        { ...row, weekday: 2 },
        { ...row, organization_id: other.organizationId },
      ])
      .execute();
    expect(await f.read()).toHaveLength(3);
    expect(await other.read()).toHaveLength(1);
  });

  it.each([
    { weekday: 0 },
    { weekday: 8 },
    { start_minute: -1 },
    { start_minute: 1440, end_minute: 1440 },
    { end_minute: 0, start_minute: 0 },
    { end_minute: 1441 },
    { start_minute: 600, end_minute: 600 },
  ])("enforces direct SQL bounds %j", async (values) => {
    const f = await fixture();
    await expect(
      db
        .insertInto("organization_weekly_hours")
        .values({
          organization_id: f.organizationId,
          weekday: 1,
          start_minute: 540,
          end_minute: 720,
          ...values,
        })
        .execute(),
    ).rejects.toMatchObject({
      code: "23514",
      table: "organization_weekly_hours",
    });
    expect(await f.read()).toEqual([]);
  });

  it("cascades hours when their Organization is deleted", async () => {
    const f = await fixture();
    await f.request("PUT", { days: initial() });
    await db
      .deleteFrom("organization")
      .where("id", "=", f.organizationId)
      .execute();
    expect(await f.read()).toEqual([]);
  });

  it("reverses and reapplies migration 0011 while preserving the Organization", async () => {
    const f = await fixture();
    await f.request("PUT", { days: initial() });
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await down(migrationDb);
      const { rows } = await sql<{
        table_name: string | null;
      }>`SELECT to_regclass('organization_weekly_hours')::text AS table_name`.execute(
        trx,
      );
      expect(rows[0]?.table_name).toBeNull();
      expect(
        await trx
          .selectFrom("organization")
          .select("id")
          .where("id", "=", f.organizationId)
          .executeTakeFirst(),
      ).toEqual({ id: f.organizationId });
      await up(migrationDb);
      await trx
        .insertInto("organization_weekly_hours")
        .values({
          organization_id: f.organizationId,
          weekday: 1,
          start_minute: 0,
          end_minute: 1440,
        })
        .execute();
    });
    expect(await f.read()).toHaveLength(1);
  });

  it.each(["GET", "PUT"] as const)(
    "validates Organization UUID for %s",
    async (method) => {
      const f = await fixture();
      const response = await f.request(
        method,
        method === "PUT" ? { days: schedule() } : undefined,
        f.userId,
        "invalid",
      );
      expect(response.statusCode).toBe(400);
      expect(await f.read()).toEqual([]);
    },
  );
});
