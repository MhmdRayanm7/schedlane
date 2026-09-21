import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { type Kysely, sql } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import type { MembershipRole } from "../../../src/db-types.js";
import {
  down,
  up,
} from "../../../src/migrations/0013_create_organization_date_overrides.js";
import { replaceOrganizationDateOverride } from "../../../src/modules/availability/application/organization-date-overrides.js";
import type { DateOverrideConfiguration } from "../../../src/modules/availability/domain/organization-date-overrides.js";
import { availabilityRoutes } from "../../../src/modules/availability/http/management-routes.js";

// Only authentication is stubbed; routes, authorization, transactions and PostgreSQL are real.
vi.mock("../../../src/http/auth-guard.js", () => ({
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

const date = "2026-10-05";
const inherit = { mode: "inherit", intervals: [] } as const;
const closed = { mode: "closed", intervals: [] } as const;
const custom = (
  intervals: DateOverrideConfiguration["intervals"] = [
    { startMinute: 600, endMinute: 840 },
    { startMinute: 960, endMinute: 1080 },
  ],
): DateOverrideConfiguration => ({ mode: "custom", intervals });
const representation = (configuration: object, targetDate = date) => ({
  timezone: "Asia/Jerusalem",
  date: targetDate,
  ...configuration,
});

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
    targetDate = date,
  ) =>
    app.inject({
      method,
      url: `/api/organizations/${targetId}/availability/date-overrides/${encodeURIComponent(targetDate)}`,
      headers: { "x-test-user": actorId },
      ...(payload === undefined ? {} : { payload }),
    });
  const read = async () => ({
    parents: await db
      .selectFrom("organization_date_override")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("local_date")
      .execute(),
    intervals: await db
      .selectFrom("organization_date_override_interval")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("local_date")
      .orderBy("start_minute")
      .execute(),
  });
  const role = (role: MembershipRole) =>
    db
      .updateTable("membership")
      .set({ role })
      .where("user_id", "=", userId)
      .execute();
  return { userId, organizationId, request, read, role };
}

describe("Organization date overrides", () => {
  it("returns inherit without copying the weekly schedule", async () => {
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
    expect(response.json()).toEqual(representation(inherit));
    expect(await f.read()).toEqual({ parents: [], intervals: [] });
  });

  it.each(["owner", "manager"] as const)(
    "lets %s set closed/custom/inherit idempotently and normalizes intervals",
    async (role) => {
      const f = await fixture();
      await f.role(role);
      for (const configuration of [
        closed,
        custom(),
        closed,
        custom(),
        inherit,
      ]) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await f.request("PUT", {
            ...configuration,
            intervals: [...configuration.intervals].reverse(),
          });
          expect(response.statusCode).toBe(200);
          expect(response.json()).toEqual(representation(configuration));
          const get = await f.request("GET");
          expect(get.statusCode).toBe(200);
          expect(get.json()).toEqual(response.json());
          expect(await f.read()).toEqual({
            parents:
              configuration.mode === "inherit"
                ? []
                : [{ organization_id: f.organizationId, local_date: date }],
            intervals: configuration.intervals.map((interval) => ({
              organization_id: f.organizationId,
              local_date: date,
              start_minute: interval.startMinute,
              end_minute: interval.endMinute,
            })),
          });
        }
      }
    },
  );

  it.each(["GET", "PUT"] as const)(
    "rejects Staff %s and preserves state",
    async (method) => {
      const f = await fixture();
      await f.request("PUT", custom());
      const before = await f.read();
      await f.role("staff");
      const response = await f.request(
        method,
        method === "PUT" ? closed : undefined,
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
    "hides non-member and missing Organizations for %s",
    async (method) => {
      const f = await fixture();
      const other = await fixture();
      await other.request("PUT", custom());
      const before = await other.read();
      for (const targetId of [other.organizationId, randomUUID()]) {
        const response = await f.request(
          method,
          method === "PUT" ? closed : undefined,
          f.userId,
          targetId,
        );
        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({
          code: "ORGANIZATION_NOT_FOUND",
          requestId: expect.any(String),
        });
      }
      expect(await other.read()).toEqual(before);
    },
  );

  it.each(["archived", "suspended"] as const)(
    "rejects %s writes, preserves state and permits reads",
    async (state) => {
      const f = await fixture();
      await f.request("PUT", custom());
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
      const response = await f.request("PUT", inherit);
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe(`ORGANIZATION_${state.toUpperCase()}`);
      expect(await f.read()).toEqual(before);
      const get = await f.request("GET");
      expect(get.statusCode).toBe(200);
      expect(get.json()).toEqual(representation(custom()));
    },
  );

  it.each([false, true])(
    "preserves Organization lifecycle with published=%s",
    async (published) => {
      const f = await fixture();
      await db
        .updateTable("organization")
        .set({ published_at: published ? new Date() : null })
        .where("id", "=", f.organizationId)
        .execute();
      const before = await db
        .selectFrom("organization")
        .selectAll()
        .where("id", "=", f.organizationId)
        .executeTakeFirstOrThrow();
      expect((await f.request("PUT", closed)).statusCode).toBe(200);
      expect(
        await db
          .selectFrom("organization")
          .selectAll()
          .where("id", "=", f.organizationId)
          .executeTakeFirstOrThrow(),
      ).toEqual(before);
    },
  );

  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-02-29",
    "1900-02-29",
    "2100-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-01-00",
    "0000-01-01",
    "2026-1-01",
    "26-01-01",
    "2026-10-05T00:00:00Z",
    "2026-10-05 ",
    "2026-10-05\n",
    "not-a-date",
  ])("rejects invalid local date %s for GET/PUT", async (invalidDate) => {
    const f = await fixture();
    await f.request("PUT", custom());
    const before = await f.read();
    for (const method of ["GET", "PUT"] as const) {
      const response = await f.request(
        method,
        method === "PUT" ? closed : undefined,
        f.userId,
        f.organizationId,
        invalidDate,
      );
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        code: "INVALID_DATE_OVERRIDE",
        message: "Date availability override is invalid",
        requestId: expect.any(String),
      });
    }
    expect(
      await replaceOrganizationDateOverride({
        ...f,
        date: invalidDate,
        mode: "closed",
        intervals: [],
      }),
    ).toEqual({ ok: false, reason: "invalid_date_override" });
    expect(await f.read()).toEqual(before);
  });

  it.each([
    "0001-01-01",
    "2000-02-29",
    "2028-02-29",
    "2026-03-27",
    "2026-10-25",
    "9999-12-31",
  ])(
    "round-trips real calendar date %s as a DATE string",
    async (targetDate) => {
      const f = await fixture();
      const put = await f.request(
        "PUT",
        closed,
        f.userId,
        f.organizationId,
        targetDate,
      );
      expect(put.statusCode).toBe(200);
      expect(put.json()).toEqual(representation(closed, targetDate));
      expect(
        (
          await f.request(
            "GET",
            undefined,
            f.userId,
            f.organizationId,
            targetDate,
          )
        ).json(),
      ).toEqual(put.json());
      expect((await f.read()).parents).toEqual([
        { organization_id: f.organizationId, local_date: targetDate },
      ]);
      await db.transaction().execute(async (trx) => {
        await sql`SET LOCAL TIME ZONE 'America/Los_Angeles'`.execute(trx);
        const result = await trx
          .selectFrom("organization_date_override")
          .select("local_date")
          .where("organization_id", "=", f.organizationId)
          .executeTakeFirstOrThrow();
        expect(result.local_date).toBe(targetDate);
      });
    },
  );

  const invalidConfigurations: Array<[string, DateOverrideConfiguration]> = [
    ["inherit with intervals", { ...custom(), mode: "inherit" }],
    ["closed with intervals", { ...custom(), mode: "closed" }],
    ["custom without intervals", custom([])],
    ["equal endpoints", custom([{ startMinute: 600, endMinute: 600 }])],
    ["reversed endpoints", custom([{ startMinute: 900, endMinute: 600 }])],
    [
      "overlap",
      custom([
        { startMinute: 600, endMinute: 840 },
        { startMinute: 800, endMinute: 900 },
      ]),
    ],
    [
      "contained interval",
      custom([
        { startMinute: 600, endMinute: 900 },
        { startMinute: 700, endMinute: 800 },
      ]),
    ],
    [
      "duplicate interval",
      custom([
        { startMinute: 600, endMinute: 840 },
        { startMinute: 600, endMinute: 840 },
      ]),
    ],
    ["negative start", custom([{ startMinute: -1, endMinute: 840 }])],
    ["start at 1440", custom([{ startMinute: 1440, endMinute: 1440 }])],
    ["zero end", custom([{ startMinute: 0, endMinute: 0 }])],
    ["end after 1440", custom([{ startMinute: 600, endMinute: 1441 }])],
    ["fractional start", custom([{ startMinute: 600.5, endMinute: 840 }])],
    ["fractional end", custom([{ startMinute: 600, endMinute: 840.5 }])],
  ];
  it.each(invalidConfigurations)(
    "rejects %s at HTTP and service boundaries",
    async (_name, configuration) => {
      const f = await fixture();
      await f.request("PUT", custom());
      const before = await f.read();
      const response = await f.request("PUT", configuration);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        code: "INVALID_DATE_OVERRIDE",
        message: "Date availability override is invalid",
        requestId: expect.any(String),
      });
      expect(
        await replaceOrganizationDateOverride({ ...f, date, ...configuration }),
      ).toEqual({ ok: false, reason: "invalid_date_override" });
      expect(await f.read()).toEqual(before);
    },
  );

  it.each([
    {},
    { mode: "invalid", intervals: [] },
    { mode: "closed" },
    { mode: "closed", intervals: null },
    { ...closed, timezone: "UTC" },
    { ...closed, date },
    ...[null, false, "600"].map((startMinute) => ({
      mode: "custom",
      intervals: [{ startMinute, endMinute: 840 }],
    })),
    {
      mode: "custom",
      intervals: [{ startMinute: 600, endMinute: 840, extra: true }],
    },
  ])("rejects malformed input %j without coercion", async (payload) => {
    const f = await fixture();
    await f.request("PUT", custom());
    const before = await f.read();
    const response = await f.request("PUT", payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_DATE_OVERRIDE");
    expect(await f.read()).toEqual(before);
  });

  it("accepts adjacent intervals and midnight endpoints", async () => {
    const f = await fixture();
    const configuration = custom([
      { startMinute: 0, endMinute: 720 },
      { startMinute: 720, endMinute: 1440 },
    ]);
    expect((await f.request("PUT", configuration)).statusCode).toBe(200);
    expect((await f.request("GET")).json()).toEqual(
      representation(configuration),
    );
  });

  it("scopes replacements to one date and Organization", async () => {
    const f = await fixture();
    const other = await fixture();
    await f.request("PUT", custom());
    await f.request("PUT", closed, f.userId, f.organizationId, "2026-10-06");
    await other.request("PUT", custom());
    const beforeOther = await other.read();
    expect((await f.request("PUT", inherit)).statusCode).toBe(200);
    expect(
      (
        await f.request(
          "GET",
          undefined,
          f.userId,
          f.organizationId,
          "2026-10-06",
        )
      ).json(),
    ).toEqual(representation(closed, "2026-10-06"));
    expect(await other.read()).toEqual(beforeOther);
  });

  it("enforces SQL overlap per date/Organization while allowing adjacency", async () => {
    const f = await fixture();
    const other = await fixture();
    const parent = { organization_id: f.organizationId, local_date: date };
    await db
      .insertInto("organization_date_override")
      .values([
        parent,
        { ...parent, local_date: "2026-10-06" },
        { ...parent, organization_id: other.organizationId },
      ])
      .execute();
    const row = { ...parent, start_minute: 600, end_minute: 840 };
    await db
      .insertInto("organization_date_override_interval")
      .values(row)
      .execute();
    await expect(
      db
        .insertInto("organization_date_override_interval")
        .values({ ...row, start_minute: 700, end_minute: 900 })
        .execute(),
    ).rejects.toMatchObject({
      code: "23P01",
      constraint: "organization_date_override_no_overlap",
    });
    await db
      .insertInto("organization_date_override_interval")
      .values([
        { ...row, start_minute: 840, end_minute: 900 },
        { ...row, local_date: "2026-10-06" },
        { ...row, organization_id: other.organizationId },
      ])
      .execute();
    expect((await f.read()).intervals).toHaveLength(3);
    expect((await other.read()).intervals).toHaveLength(1);
  });

  it.each([
    { start_minute: -1 },
    { start_minute: 1440, end_minute: 1440 },
    { end_minute: 0 },
    { end_minute: 1441 },
    { start_minute: 600, end_minute: 600 },
  ])("enforces SQL interval checks %j", async (values) => {
    const f = await fixture();
    const parent = { organization_id: f.organizationId, local_date: date };
    await db.insertInto("organization_date_override").values(parent).execute();
    await expect(
      db
        .insertInto("organization_date_override_interval")
        .values({ ...parent, start_minute: 600, end_minute: 840, ...values })
        .execute(),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces parent/tenant foreign keys and cascades Organization deletion", async () => {
    const f = await fixture();
    const other = await fixture();
    const row = {
      organization_id: f.organizationId,
      local_date: date,
      start_minute: 600,
      end_minute: 840,
    };
    await expect(
      db
        .insertInto("organization_date_override_interval")
        .values(row)
        .execute(),
    ).rejects.toMatchObject({ code: "23503" });
    await f.request("PUT", custom());
    await expect(
      db
        .insertInto("organization_date_override_interval")
        .values({ ...row, organization_id: other.organizationId })
        .execute(),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      db
        .insertInto("organization_date_override")
        .values({ organization_id: randomUUID(), local_date: date })
        .execute(),
    ).rejects.toMatchObject({ code: "23503" });
    await db
      .deleteFrom("organization")
      .where("id", "=", f.organizationId)
      .execute();
    expect(await f.read()).toEqual({ parents: [], intervals: [] });
  });

  it.each(["closed", "custom"] as const)(
    "restores previous %s parent and intervals after insert failure",
    async (mode) => {
      const f = await fixture();
      const original = mode === "closed" ? closed : custom();
      await f.request("PUT", original);
      const before = await f.read();
      await sql`ALTER TABLE organization_date_override_interval ADD CONSTRAINT test_insert_failure CHECK (end_minute <> 1001)`.execute(
        db,
      );
      try {
        const response = await f.request(
          "PUT",
          custom([{ startMinute: 600, endMinute: 1001 }]),
        );
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          code: "INVALID_DATE_OVERRIDE",
          message: "Date availability override is invalid",
          requestId: expect.any(String),
        });
        expect(await f.read()).toEqual(before);
        expect((await f.request("GET")).json()).toEqual(
          representation(original),
        );
      } finally {
        await sql`ALTER TABLE organization_date_override_interval DROP CONSTRAINT test_insert_failure`.execute(
          db,
        );
      }
    },
  );

  it("serializes concurrent replacements from different actors", async () => {
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
    const first = custom();
    const second = custom([{ startMinute: 0, endMinute: 1440 }]);
    const results = await Promise.all([
      replaceOrganizationDateOverride({ ...f, date, ...first }),
      replaceOrganizationDateOverride({
        ...f,
        userId: manager.userId,
        date,
        ...second,
      }),
    ]);
    expect(results).toEqual([
      { ok: true, override: representation(first) },
      { ok: true, override: representation(second) },
    ]);
    expect([representation(first), representation(second)]).toContainEqual(
      (await f.request("GET")).json(),
    );
  });

  it("reverses and reapplies migration 0013 without modifying its Organization", async () => {
    const f = await fixture();
    await f.request("PUT", custom());
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await down(migrationDb);
      const { rows } = await sql<{
        parent: string | null;
        child: string | null;
      }>`SELECT to_regclass('organization_date_override')::text AS parent, to_regclass('organization_date_override_interval')::text AS child`.execute(
        trx,
      );
      expect(rows[0]).toEqual({ parent: null, child: null });
      expect(
        await trx
          .selectFrom("organization")
          .select("id")
          .where("id", "=", f.organizationId)
          .executeTakeFirst(),
      ).toEqual({ id: f.organizationId });
      await up(migrationDb);
    });
    expect((await f.request("PUT", custom())).statusCode).toBe(200);
    expect((await f.request("GET")).json()).toEqual(representation(custom()));
  });

  it.each(["GET", "PUT"] as const)(
    "validates Organization UUID for %s",
    async (method) => {
      const f = await fixture();
      const response = await f.request(
        method,
        method === "PUT" ? closed : undefined,
        f.userId,
        "invalid",
      );
      expect(response.statusCode).toBe(400);
      expect(await f.read()).toEqual({ parents: [], intervals: [] });
    },
  );
});
