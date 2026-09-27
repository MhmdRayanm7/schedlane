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

async function createUser(name = "Applicant") {
  const id = randomUUID();
  await db
    .insertInto("user")
    .values({
      id,
      name,
      email: `${id}@example.test`,
      emailVerified: true,
      image: null,
    })
    .execute();
  return id;
}

const validRequest = {
  name: "North Star Studio",
  description: "We need scheduling for our client consultation team.",
  contactPhone: "+972 50 123 4567",
  additionalContext: "We expect to onboard four team members.",
  wantsSetupHelp: true,
};

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

describe("Organization request onboarding", () => {
  it("persists a valid request and emits its submitted event", async () => {
    const userId = await createUser();
    const response = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": userId },
      payload: validRequest,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      ...validRequest,
      status: "pending",
    });

    const stored = await db
      .selectFrom("organization_request")
      .selectAll()
      .where("requested_by_user_id", "=", userId)
      .executeTakeFirstOrThrow();
    expect(stored).toMatchObject({
      name: validRequest.name,
      description: validRequest.description,
      contact_phone: validRequest.contactPhone,
      additional_context: validRequest.additionalContext,
      wants_setup_help: true,
    });

    const event = await db
      .selectFrom("outbox_event")
      .select(["aggregate_id", "event_type", "payload"])
      .executeTakeFirstOrThrow();
    expect(event).toMatchObject({
      aggregate_id: stored.id,
      event_type: "organization_request.submitted",
      payload: expect.objectContaining({
        requestId: stored.id,
        applicantEmail: `${userId}@example.test`,
      }),
    });
  });

  it("requires a useful description", async () => {
    const userId = await createUser();
    const response = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": userId },
      payload: { ...validRequest, description: "short" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("blocks a second pending request", async () => {
    const userId = await createUser();
    const first = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": userId },
      payload: validRequest,
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": userId },
      payload: validRequest,
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("ORGANIZATION_REQUEST_PENDING");
  });

  it("allows a new row after rejection and returns only the applicant's latest status", async () => {
    const f = await fixture();
    const applicantId = await createUser();
    const otherId = await createUser("Other applicant");

    const first = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": applicantId },
      payload: validRequest,
    });
    const requestId = first.json().id;
    const rejected = await app.inject({
      method: "POST",
      url: `/api/platform/organization-requests/${requestId}/reject`,
      headers: { "x-test-user": f.adminId },
      payload: { reason: "Please include a clearer operating plan." },
    });
    expect(rejected.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": otherId },
      payload: { ...validRequest, name: "Other workspace" },
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": applicantId },
      payload: { ...validRequest, name: "North Star Studio Revised" },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().id).not.toBe(requestId);

    const status = await app.inject({
      method: "GET",
      url: "/api/organization-requests/me",
      headers: { "x-test-user": applicantId },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().request).toMatchObject({
      id: second.json().id,
      name: "North Star Studio Revised",
      status: "pending",
    });
  });

  it("blocks onboarding for a user with an organization membership", async () => {
    const userId = await createUser();
    const organization = await db
      .insertInto("organization")
      .values({ name: "Existing", slug: `existing-${randomUUID()}` })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("membership")
      .values({
        organization_id: organization.id,
        user_id: userId,
        role: "staff",
      })
      .execute();

    const response = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": userId },
      payload: validRequest,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_MEMBERSHIP_EXISTS");
  });
});

describe("Platform review and organization directory", () => {
  it("rejects non-admin access before exposing platform data", async () => {
    const userId = await createUser();
    for (const url of [
      "/api/platform/me",
      "/api/platform/organization-requests",
      "/api/platform/organizations",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { "x-test-user": userId },
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it("shows request detail and safely approves it into an unpublished owner workspace", async () => {
    const f = await fixture();
    const applicantId = await createUser("Workspace owner");
    const submitted = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": applicantId },
      payload: validRequest,
    });
    const requestId = submitted.json().id;

    const detail = await app.inject({
      method: "GET",
      url: `/api/platform/organization-requests/${requestId}`,
      headers: { "x-test-user": f.adminId },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: requestId,
      description: validRequest.description,
      contactPhone: validRequest.contactPhone,
      requestedBy: {
        name: "Workspace owner",
        email: `${applicantId}@example.test`,
      },
    });

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/platform/organization-requests/${requestId}/approve`,
        headers: { "x-test-user": f.adminId },
        payload: { slug: "north-star-studio" },
      }),
      app.inject({
        method: "POST",
        url: `/api/platform/organization-requests/${requestId}/approve`,
        headers: { "x-test-user": f.adminId },
        payload: { slug: "north-star-studio-copy" },
      }),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);

    const organization = await db
      .selectFrom("organization")
      .selectAll()
      .where("name", "=", validRequest.name)
      .executeTakeFirstOrThrow();
    expect(organization.published_at).toBeNull();
    const membership = await db
      .selectFrom("membership")
      .select(["user_id", "role"])
      .where("organization_id", "=", organization.id)
      .executeTakeFirstOrThrow();
    expect(membership).toEqual({ user_id: applicantId, role: "owner" });

    const events = await db
      .selectFrom("outbox_event")
      .select("event_type")
      .orderBy("created_at")
      .execute();
    expect(events.map((event) => event.event_type)).toEqual([
      "organization_request.submitted",
      "organization_request.approved",
    ]);

    const directory = await app.inject({
      method: "GET",
      url: "/api/platform/organizations?limit=1",
      headers: { "x-test-user": f.adminId },
    });
    expect(directory.statusCode).toBe(200);
    expect(directory.json().items[0]).toMatchObject({
      id: organization.id,
      publishedAt: null,
      publicBookingPaused: false,
      suspendedAt: null,
      archivedAt: null,
      owner: { email: `${applicantId}@example.test` },
    });
  });

  it("reports slug conflicts without deciding the request", async () => {
    const f = await fixture();
    const applicantId = await createUser();
    await db
      .insertInto("organization")
      .values({ name: "Taken", slug: "already-taken" })
      .execute();
    const submitted = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": applicantId },
      payload: validRequest,
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/platform/organization-requests/${submitted.json().id}/approve`,
      headers: { "x-test-user": f.adminId },
      payload: { slug: "already-taken" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_SLUG_TAKEN");
    const stored = await db
      .selectFrom("organization_request")
      .select("status")
      .where("id", "=", submitted.json().id)
      .executeTakeFirstOrThrow();
    expect(stored.status).toBe("pending");
  });

  it("requires a rejection reason and prevents another decision", async () => {
    const f = await fixture();
    const request = await f.createRequest("2026-10-05T12:00:00.001000Z");
    const invalid = await app.inject({
      method: "POST",
      url: `/api/platform/organization-requests/${request.id}/reject`,
      headers: { "x-test-user": f.adminId },
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);

    const rejected = await app.inject({
      method: "POST",
      url: `/api/platform/organization-requests/${request.id}/reject`,
      headers: { "x-test-user": f.adminId },
      payload: { reason: "The intended use needs more detail." },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().request.rejectionReason).toBe(
      "The intended use needs more detail.",
    );

    const decidedAgain = await app.inject({
      method: "POST",
      url: `/api/platform/organization-requests/${request.id}/approve`,
      headers: { "x-test-user": f.adminId },
      payload: { slug: "too-late" },
    });
    expect(decidedAgain.statusCode).toBe(409);
  });
});
