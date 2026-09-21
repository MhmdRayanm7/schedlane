import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { type Kysely, sql } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import type { MembershipRole } from "../../../src/db-types.js";
import {
  down,
  up,
} from "../../../src/migrations/0015_create_resource_time_block.js";
import { createResourceTimeBlock } from "../../../src/modules/availability/application/resource-time-blocks.js";
import { availabilityRoutes } from "../../../src/modules/availability/http/management-routes.js";

// Only authentication is stubbed; HTTP validation, authorization and PostgreSQL are real.
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
const interval = { startMinute: 720, endMinute: 780 };

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
      slug: `blocks-${randomUUID()}`,
      name: "Time Block organization",
      published_at: null,
      archived_at: null,
      suspended_at: null,
    })
    .returning("id")
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
    .returning("id")
    .executeTakeFirstOrThrow();
  const resourceId = resource.id;
  const request = (
    method: "GET" | "POST" | "DELETE",
    options: {
      payload?: object;
      userId?: string;
      organizationId?: string;
      resourceId?: string;
      date?: string;
      timeBlockId?: string;
    } = {},
  ) =>
    app.inject({
      method,
      url: `/api/organizations/${options.organizationId ?? organizationId}/resources/${options.resourceId ?? resourceId}/availability/time-blocks/${encodeURIComponent(method === "DELETE" ? (options.timeBlockId ?? randomUUID()) : (options.date ?? date))}`,
      headers: { "x-test-user": options.userId ?? userId },
      ...(method === "POST" ? { payload: options.payload ?? interval } : {}),
    });
  const read = () =>
    db
      .selectFrom("resource_time_block")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("resource_id", "=", resourceId)
      .orderBy("local_date")
      .orderBy("start_minute")
      .orderBy("id")
      .execute();
  const role = (role: MembershipRole) =>
    db
      .updateTable("membership")
      .set({ role })
      .where("organization_id", "=", organizationId)
      .where("user_id", "=", userId)
      .execute();
  return { userId, organizationId, resourceId, request, read, role };
}

describe("Resource Time Blocks", () => {
  it("returns an empty date list before setup", async () => {
    const f = await fixture();
    const response = await f.request("GET");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      timezone: "Asia/Jerusalem",
      resourceId: f.resourceId,
      date,
      items: [],
    });
    expect(await f.read()).toEqual([]);
  });

  it("creates independent blocks with generated IDs/timestamps and lists the exact date in order", async () => {
    const f = await fixture();
    const created = [];
    for (const payload of [
      { startMinute: 900, endMinute: 960 },
      interval,
      { startMinute: 0, endMinute: 60 },
    ]) {
      const response = await f.request("POST", { payload });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        resourceId: f.resourceId,
        date,
        ...payload,
        createdAt: expect.any(String),
      });
      expect(new Date(response.json().createdAt).toISOString()).toBe(
        response.json().createdAt,
      );
      created.push(response.json());
    }
    expect((await f.request("POST", { date: "2026-10-06" })).statusCode).toBe(
      201,
    );
    const list = await f.request("GET");
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({
      timezone: "Asia/Jerusalem",
      resourceId: f.resourceId,
      date,
      items: created
        .sort((a, b) => a.startMinute - b.startMinute)
        .map(({ id, startMinute, endMinute, createdAt }) => ({
          id,
          startMinute,
          endMinute,
          createdAt,
        })),
    });
    const rows = await f.read();
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => typeof row.local_date)).toEqual([
      "string",
      "string",
      "string",
      "string",
    ]);
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
    "%s managing %s Resource: allowed=%s for GET/POST/DELETE",
    async (actorRole, linkedRole, allowed) => {
      const f = await fixture();
      const created = (await f.request("POST")).json();
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
      for (const method of ["GET", "POST", "DELETE"] as const) {
        const response = await f.request(method, {
          payload: { startMinute: 900, endMinute: 960 },
          timeBlockId: created.id,
        });
        expect(response.statusCode).toBe(
          allowed ? { GET: 200, POST: 201, DELETE: 204 }[method] : 403,
        );
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

  it.each(["GET", "POST", "DELETE"] as const)(
    "hides non-member Organizations and foreign/missing Resources for %s",
    async (method) => {
      const f = await fixture();
      const other = await fixture();
      const block = (await other.request("POST")).json();
      const before = await other.read();
      for (const organizationId of [other.organizationId, randomUUID()]) {
        const response = await f.request(method, {
          organizationId,
          resourceId: other.resourceId,
          timeBlockId: block.id,
        });
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe("ORGANIZATION_NOT_FOUND");
      }
      for (const resourceId of [other.resourceId, randomUUID()]) {
        const response = await f.request(method, {
          resourceId,
          timeBlockId: block.id,
        });
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe("RESOURCE_NOT_FOUND");
      }
      expect(await other.read()).toEqual(before);
    },
  );

  it("keeps deactivated Resources manageable without lifecycle changes", async () => {
    const f = await fixture();
    await db
      .updateTable("resource")
      .set({ deactivated_at: new Date() })
      .where("id", "=", f.resourceId)
      .execute();
    const before = await db
      .selectFrom("resource")
      .selectAll()
      .where("id", "=", f.resourceId)
      .executeTakeFirstOrThrow();
    const post = await f.request("POST");
    expect(post.statusCode).toBe(201);
    expect((await f.request("GET")).json().items).toHaveLength(1);
    expect(
      (await f.request("DELETE", { timeBlockId: post.json().id })).statusCode,
    ).toBe(204);
    expect(await f.read()).toEqual([]);
    expect(
      await db
        .selectFrom("resource")
        .selectAll()
        .where("id", "=", f.resourceId)
        .executeTakeFirstOrThrow(),
    ).toEqual(before);
  });

  it.each(["archived", "suspended"] as const)(
    "blocks %s creation and deletion, preserving storage and allowing reads",
    async (state) => {
      const f = await fixture();
      const block = (await f.request("POST")).json();
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
      for (const method of ["POST", "DELETE"] as const) {
        const response = await f.request(method, {
          payload: { startMinute: 900, endMinute: 960 },
          timeBlockId: block.id,
        });
        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          code: `ORGANIZATION_${state.toUpperCase()}`,
          requestId: expect.any(String),
        });
        expect(await f.read()).toEqual(before);
      }
      const get = await f.request("GET");
      expect(get.statusCode).toBe(200);
      expect(get.json().items).toHaveLength(1);
    },
  );

  it.each([
    "2026-02-30",
    "2026-13-01",
    "1900-02-29",
    "0000-01-01",
    "2026-1-01",
    "2026-10-05\n",
    "2026-10-05T00:00:00Z",
  ])("rejects invalid calendar date %j", async (date) => {
    const f = await fixture();
    await f.request("POST");
    const before = await f.read();
    for (const method of ["GET", "POST"] as const) {
      const response = await f.request(method, { date });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "INVALID_TIME_BLOCK",
        requestId: expect.any(String),
      });
    }
    expect(await createResourceTimeBlock({ ...f, date, ...interval })).toEqual({
      ok: false,
      reason: "invalid_time_block",
    });
    expect(await f.read()).toEqual(before);
  });

  it.each([
    { startMinute: -1, endMinute: 60 },
    { startMinute: 1440, endMinute: 1440 },
    { startMinute: 0, endMinute: 0 },
    { startMinute: 720, endMinute: 1441 },
    { startMinute: 720.5, endMinute: 780 },
    { startMinute: 720, endMinute: 780.5 },
    { startMinute: 720, endMinute: 720 },
    { startMinute: 780, endMinute: 720 },
  ])(
    "rejects invalid interval %j at HTTP and service boundaries",
    async (payload) => {
      const f = await fixture();
      await f.request("POST");
      const before = await f.read();
      const response = await f.request("POST", { payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("INVALID_TIME_BLOCK");
      expect(await createResourceTimeBlock({ ...f, date, ...payload })).toEqual(
        { ok: false, reason: "invalid_time_block" },
      );
      expect(await f.read()).toEqual(before);
    },
  );

  it.each([
    {},
    { startMinute: 720 },
    ...[null, false, "720"].map((startMinute) => ({
      startMinute,
      endMinute: 780,
    })),
    ...["id", "organizationId", "resourceId", "createdAt", "date", "note"].map(
      (field) => ({ ...interval, [field]: "not-allowed" }),
    ),
  ])("rejects malformed/extra input %j without coercion", async (payload) => {
    const f = await fixture();
    const response = await f.request("POST", { payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_TIME_BLOCK");
    expect(await f.read()).toEqual([]);
  });

  it("accepts adjacent blocks including midnight bounds and rejects overlap safely", async () => {
    const f = await fixture();
    expect(
      (await f.request("POST", { payload: { startMinute: 0, endMinute: 720 } }))
        .statusCode,
    ).toBe(201);
    expect(
      (
        await f.request("POST", {
          payload: { startMinute: 720, endMinute: 1440 },
        })
      ).statusCode,
    ).toBe(201);
    const before = await f.read();
    for (const payload of [
      interval,
      { startMinute: 0, endMinute: 720 },
      { startMinute: 600, endMinute: 800 },
    ]) {
      const response = await f.request("POST", { payload });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        code: "TIME_BLOCK_OVERLAP",
        message: "Time Block overlaps an existing Time Block",
        requestId: expect.any(String),
      });
      expect(await f.read()).toEqual(before);
    }
  });

  it("allows only one concurrent overlapping create by different actors", async () => {
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
    const responses = await Promise.all([
      f.request("POST"),
      f.request("POST", {
        userId: manager.userId,
        payload: { startMinute: 750, endMinute: 810 },
      }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(await f.read()).toHaveLength(1);
  });

  it("enforces direct SQL overlap while allowing other dates/Resources/Organizations", async () => {
    const f = await fixture();
    const other = await fixture();
    const second = await db
      .insertInto("resource")
      .values({
        organization_id: f.organizationId,
        user_id: null,
        name: "Second",
        deactivated_at: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const row = {
      organization_id: f.organizationId,
      resource_id: f.resourceId,
      local_date: date,
      start_minute: 720,
      end_minute: 840,
    };
    await db.insertInto("resource_time_block").values(row).execute();
    await expect(
      db
        .insertInto("resource_time_block")
        .values({ ...row, start_minute: 780, end_minute: 900 })
        .execute(),
    ).rejects.toMatchObject({
      code: "23P01",
      constraint: "resource_time_block_no_overlap",
    });
    await db
      .insertInto("resource_time_block")
      .values([
        { ...row, start_minute: 840, end_minute: 900 },
        { ...row, local_date: "2026-10-06" },
        { ...row, resource_id: second.id },
        {
          ...row,
          organization_id: other.organizationId,
          resource_id: other.resourceId,
        },
      ])
      .execute();
    expect(await f.read()).toHaveLength(3);
    expect(
      (await f.request("GET", { resourceId: second.id })).json().items,
    ).toHaveLength(1);
    expect((await other.request("GET")).json().items).toHaveLength(1);
    await expect(
      db
        .insertInto("resource_time_block")
        .values({ ...row, organization_id: other.organizationId })
        .execute(),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "resource_time_block_resource_organization_fk",
    });
  });

  it.each([
    { start_minute: -1 },
    { start_minute: 1440, end_minute: 1440 },
    { end_minute: 0 },
    { end_minute: 1441 },
    { start_minute: 780, end_minute: 780 },
  ])("enforces direct SQL minute checks %j", async (values) => {
    const f = await fixture();
    await expect(
      db
        .insertInto("resource_time_block")
        .values({
          organization_id: f.organizationId,
          resource_id: f.resourceId,
          local_date: date,
          start_minute: 720,
          end_minute: 780,
          ...values,
        })
        .execute(),
    ).rejects.toMatchObject({ code: "23514", table: "resource_time_block" });
  });

  it("accepts a block outside configured working hours and preserves publication", async () => {
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
    await db
      .updateTable("organization")
      .set({ published_at: new Date() })
      .where("id", "=", f.organizationId)
      .execute();
    const before = await db
      .selectFrom("organization")
      .selectAll()
      .where("id", "=", f.organizationId)
      .executeTakeFirstOrThrow();
    const response = await f.request("POST", {
      payload: { startMinute: 60, endMinute: 120 },
    });
    expect(response.statusCode).toBe(201);
    expect(
      await db
        .selectFrom("organization")
        .selectAll()
        .where("id", "=", f.organizationId)
        .executeTakeFirstOrThrow(),
    ).toEqual(before);
  });

  it("deletes exactly the scoped block and hides foreign/missing block ownership", async () => {
    const f = await fixture();
    const other = await fixture();
    const first = (await f.request("POST")).json();
    const keep = (
      await f.request("POST", { payload: { startMinute: 900, endMinute: 960 } })
    ).json();
    const foreign = (await other.request("POST")).json();
    const second = await db
      .insertInto("resource")
      .values({
        organization_id: f.organizationId,
        user_id: null,
        name: "Second",
        deactivated_at: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const sibling = (await f.request("POST", { resourceId: second.id })).json();
    for (const timeBlockId of [foreign.id, sibling.id, randomUUID()]) {
      const response = await f.request("DELETE", { timeBlockId });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        code: "TIME_BLOCK_NOT_FOUND",
        requestId: expect.any(String),
      });
    }
    const response = await f.request("DELETE", { timeBlockId: first.id });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect((await f.read()).map((row) => row.id)).toEqual([keep.id]);
    expect(
      (await f.request("DELETE", { timeBlockId: first.id })).json().code,
    ).toBe("TIME_BLOCK_NOT_FOUND");
    expect(await other.read()).toHaveLength(1);
    expect(
      (await f.request("GET", { resourceId: second.id })).json().items,
    ).toHaveLength(1);
  });

  it.each(["resource", "organization"] as const)(
    "cascades blocks on %s deletion",
    async (table) => {
      const f = await fixture();
      await f.request("POST");
      await db
        .deleteFrom(table)
        .where(
          "id",
          "=",
          table === "resource" ? f.resourceId : f.organizationId,
        )
        .execute();
      expect(await f.read()).toEqual([]);
    },
  );

  it("reverses and reapplies migration 0015 while preserving its Resource", async () => {
    const f = await fixture();
    await f.request("POST");
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await down(migrationDb);
      const { rows } = await sql<{
        table_name: string | null;
      }>`SELECT to_regclass('resource_time_block')::text AS table_name`.execute(
        trx,
      );
      expect(rows[0]?.table_name).toBeNull();
      expect(
        await trx
          .selectFrom("resource")
          .select("id")
          .where("id", "=", f.resourceId)
          .executeTakeFirst(),
      ).toEqual({ id: f.resourceId });
      await up(migrationDb);
    });
    expect((await f.request("POST")).statusCode).toBe(201);
    expect((await f.request("POST")).statusCode).toBe(409);
  });

  it.each(["GET", "POST", "DELETE"] as const)(
    "validates UUID parameters for %s",
    async (method) => {
      const f = await fixture();
      for (const options of [
        { organizationId: "invalid" },
        { resourceId: "invalid" },
        ...(method === "DELETE" ? [{ timeBlockId: "invalid" }] : []),
      ]) {
        expect((await f.request(method, options)).statusCode).toBe(400);
      }
      expect(await f.read()).toEqual([]);
    },
  );
});
