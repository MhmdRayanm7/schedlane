import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { sql } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import { organizationRoutes } from "../../../src/modules/organizations/http/index.js";

// Stub only authentication; HTTP validation, authorization and PostgreSQL are real.
vi.mock("../../../src/http/auth-guard.js", () => ({
  requireVerifiedUser: async (request: {
    headers: Record<string, string>;
    verifiedUser: unknown;
  }) => {
    request.verifiedUser = {
      id: request.headers["x-test-user"],
      email: "admin@example.test",
    };
  },
}));

const app = Fastify();
await app.register(organizationRoutes);
afterAll(() => app.close());

async function fixture() {
  const adminId = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: adminId,
      name: "Platform admin",
      email: `${adminId}@example.test`,
      emailVerified: true,
      image: null,
    })
    .execute();
  await db
    .insertInto("platform_admin")
    .values({ user_id: adminId, revoked_at: null })
    .execute();

  const createRequest = async (createdAt: string) => {
    const requesterId = randomUUID();
    await db
      .insertInto("user")
      .values({
        id: requesterId,
        name: "Requester",
        email: `${requesterId}@example.test`,
        emailVerified: true,
        image: null,
      })
      .execute();
    const request = await db
      .insertInto("organization_request")
      .values({
        requested_by_user_id: requesterId,
        name: `Request ${requesterId}`,
        status: "pending",
        reviewed_by_user_id: null,
        organization_id: null,
        rejection_reason: null,
        decided_at: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await sql`UPDATE organization_request
      SET created_at = ${createdAt}::timestamptz
      WHERE id = ${request.id}::uuid`.execute(db);
    return request;
  };

  const list = (options: {
    cursor?: string;
    limit?: number;
    status?: "pending" | "approved" | "rejected";
  }) => {
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.cursor !== undefined) query.set("cursor", options.cursor);
    if (options.status !== undefined) query.set("status", options.status);
    return app.inject({
      method: "GET",
      url: `/api/platform/organization-requests?${query}`,
      headers: { "x-test-user": adminId },
    });
  };

  return { adminId, createRequest, list };
}

async function collectPages(
  list: (options: { cursor?: string; limit: number }) => Promise<{
    statusCode: number;
    json(): { items: Array<{ id: string }>; nextCursor: string | null };
  }>,
  limit: number,
) {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const response = await list(cursor ? { cursor, limit } : { limit });
    expect(response.statusCode).toBe(200);
    const page = response.json();
    ids.push(...page.items.map((item: { id: string }) => item.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return ids;
}

describe("Platform organization requests", () => {
  it("paginates requests that differ only below JavaScript millisecond precision", async () => {
    const f = await fixture();
    const older = await f.createRequest("2026-10-05T12:00:00.123800Z");
    const newer = await f.createRequest("2026-10-05T12:00:00.123900Z");

    expect(await collectPages(f.list, 1)).toEqual([newer.id, older.id]);
  });

  it("uses request id as a deterministic tie-breaker for equal timestamps", async () => {
    const f = await fixture();
    const first = await f.createRequest("2026-10-05T12:00:00.123000Z");
    const second = await f.createRequest("2026-10-05T12:00:00.123000Z");

    expect(await collectPages(f.list, 1)).toEqual(
      [first.id, second.id].sort((a, b) => b.localeCompare(a)),
    );
  });

  it("traverses multiple pages without omissions or duplicates", async () => {
    const f = await fixture();
    const requests = await Promise.all([
      f.createRequest("2026-10-05T12:00:00.001000Z"),
      f.createRequest("2026-10-05T12:00:00.002000Z"),
      f.createRequest("2026-10-05T12:00:00.003000Z"),
      f.createRequest("2026-10-05T12:00:00.004000Z"),
      f.createRequest("2026-10-05T12:00:00.005000Z"),
    ]);

    expect(await collectPages(f.list, 2)).toEqual(
      requests.map((request) => request.id).reverse(),
    );
  });

  it("binds cursors to their status filter", async () => {
    const f = await fixture();
    await f.createRequest("2026-10-05T12:00:00.001000Z");
    await f.createRequest("2026-10-05T12:00:00.002000Z");
    const firstPage = await f.list({ limit: 1, status: "pending" });
    const cursor = firstPage.json().nextCursor;
    expect(cursor).toEqual(expect.any(String));

    for (const status of [undefined, "approved"] as const) {
      const response = await f.list({
        limit: 1,
        cursor,
        ...(status ? { status } : {}),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("INVALID_CURSOR");
    }
  });

  it("rejects malformed cursors", async () => {
    const f = await fixture();
    const response = await f.list({ limit: 1, cursor: "not-a-cursor" });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_CURSOR");
  });

  it.each([
    {
      endpoint: "approve",
      payload: { slug: "approved-organization" },
    },
    {
      endpoint: "reject",
      payload: { reason: "No longer needed" },
    },
  ] as const)(
    "validates request UUIDs before %s processing and preserves missing-request behavior",
    async ({ endpoint, payload }) => {
      const f = await fixture();
      const headers = { "x-test-user": f.adminId };

      const malformed = await app.inject({
        method: "POST",
        url: `/api/platform/organization-requests/not-a-uuid/${endpoint}`,
        headers,
        payload,
      });
      expect(malformed.statusCode).toBe(400);

      const missing = await app.inject({
        method: "POST",
        url: `/api/platform/organization-requests/${randomUUID()}/${endpoint}`,
        headers,
        payload,
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe("ORGANIZATION_REQUEST_NOT_FOUND");
    },
  );
});
