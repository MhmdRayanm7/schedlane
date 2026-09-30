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

describe("Platform organization lifecycle", () => {
  it("approves an additional organization without replacing prior memberships", async () => {
    const f = await fixture();
    const applicantId = await createUser("Multi organization owner");
    const existing = await db
      .insertInto("organization")
      .values({ name: "Existing workspace", slug: `existing-${randomUUID()}` })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("membership")
      .values({
        organization_id: existing.id,
        user_id: applicantId,
        role: "manager",
      })
      .execute();
    const submitted = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": applicantId },
      payload: { ...validRequest, name: "Second workspace" },
    });
    const approved = await app.inject({
      method: "POST",
      url: `/api/platform/organization-requests/${submitted.json().id}/approve`,
      headers: { "x-test-user": f.adminId },
      payload: { slug: `second-${randomUUID()}` },
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json().organization.publishedAt).toBeNull();
    expect(
      await db
        .selectFrom("membership")
        .select(["organization_id", "role"])
        .where("user_id", "=", applicantId)
        .orderBy("organization_id")
        .execute(),
    ).toEqual(
      expect.arrayContaining([
        { organization_id: existing.id, role: "manager" },
        {
          organization_id: approved.json().organization.id,
          role: "owner",
        },
      ]),
    );

    const nextRequest = await app.inject({
      method: "POST",
      url: "/api/organization-requests",
      headers: { "x-test-user": applicantId },
      payload: { ...validRequest, name: "Third workspace" },
    });
    expect(nextRequest.statusCode).toBe(201);
  });

  it("atomically provisions an unpublished organization for a verified existing user", async () => {
    const f = await fixture();
    const ownerId = await createUser("Manual owner");
    const owner = await db
      .selectFrom("user")
      .select("email")
      .where("id", "=", ownerId)
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: "POST",
      url: "/api/platform/organizations",
      headers: { "x-test-user": f.adminId },
      payload: {
        organizationName: "Manual Studio",
        ownerEmail: owner.email.toUpperCase(),
        customerMessage: "Welcome to your new workspace.",
        internalNote: "Created after a phone conversation.",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: "Manual Studio",
      slug: "manual-studio",
      publishedAt: null,
      owner: { id: ownerId },
    });
    const organizationId = response.json().id;
    expect(
      await db
        .selectFrom("membership")
        .select("role")
        .where("organization_id", "=", organizationId)
        .where("user_id", "=", ownerId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ role: "owner" });
    expect(
      await db
        .selectFrom("organization_lifecycle_event")
        .select(["action", "actor_user_id", "internal_note"])
        .where("organization_id", "=", organizationId)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      action: "manually_provisioned",
      actor_user_id: f.adminId,
      internal_note: "Created after a phone conversation.",
    });
    const event = await db
      .selectFrom("outbox_event")
      .select(["event_type", "payload"])
      .where("aggregate_id", "=", organizationId)
      .executeTakeFirstOrThrow();
    expect(event.event_type).toBe("organization.manually_provisioned");
    expect(event.payload).toMatchObject({
      customerMessage: "Welcome to your new workspace.",
    });
    expect(JSON.stringify(event.payload)).not.toContain("phone conversation");
  });

  it("rejects unknown or unverified owners and non-platform callers", async () => {
    const f = await fixture();
    const ordinaryUserId = await createUser("Ordinary user");
    const payload = {
      organizationName: "Manual Studio",
      ownerEmail: "missing@example.test",
    };
    const forbidden = await app.inject({
      method: "POST",
      url: "/api/platform/organizations",
      headers: { "x-test-user": ordinaryUserId },
      payload,
    });
    expect(forbidden.statusCode).toBe(403);

    const missing = await app.inject({
      method: "POST",
      url: "/api/platform/organizations",
      headers: { "x-test-user": f.adminId },
      payload,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("OWNER_ACCOUNT_NOT_FOUND");
  });

  it("requires a reason and audits suspend and unsuspend without changing publication settings", async () => {
    const f = await fixture();
    const ownerId = await createUser("Lifecycle owner");
    const organization = await db
      .insertInto("organization")
      .values({
        name: "Lifecycle Studio",
        slug: `lifecycle-${randomUUID()}`,
        published_at: new Date("2026-09-29T08:00:00.000Z"),
        public_booking_paused: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await db
      .insertInto("membership")
      .values({
        organization_id: organization.id,
        user_id: ownerId,
        role: "owner",
      })
      .execute();

    const empty = await app.inject({
      method: "POST",
      url: `/api/platform/organizations/${organization.id}/suspend`,
      headers: { "x-test-user": f.adminId },
      payload: { reason: "" },
    });
    expect(empty.statusCode).toBe(400);

    const suspended = await app.inject({
      method: "POST",
      url: `/api/platform/organizations/${organization.id}/suspend`,
      headers: { "x-test-user": f.adminId },
      payload: { reason: "Account review is required." },
    });
    expect(suspended.statusCode).toBe(200);
    const duplicate = await app.inject({
      method: "POST",
      url: `/api/platform/organizations/${organization.id}/suspend`,
      headers: { "x-test-user": f.adminId },
      payload: { reason: "Again" },
    });
    expect(duplicate.statusCode).toBe(409);

    const unsuspended = await app.inject({
      method: "POST",
      url: `/api/platform/organizations/${organization.id}/unsuspend`,
      headers: { "x-test-user": f.adminId },
      payload: { internalNote: "Review completed." },
    });
    expect(unsuspended.statusCode).toBe(200);
    expect(
      await db
        .selectFrom("organization")
        .select(["published_at", "public_booking_paused", "suspended_at"])
        .where("id", "=", organization.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      published_at: organization.published_at,
      public_booking_paused: true,
      suspended_at: null,
    });
    expect(
      await db
        .selectFrom("organization_lifecycle_event")
        .select(["action", "reason", "internal_note"])
        .where("organization_id", "=", organization.id)
        .orderBy("occurred_at", "asc")
        .execute(),
    ).toEqual([
      {
        action: "suspended",
        reason: "Account review is required.",
        internal_note: null,
      },
      {
        action: "unsuspended",
        reason: null,
        internal_note: "Review completed.",
      },
    ]);
    expect(
      await db
        .selectFrom("outbox_event")
        .select("event_type")
        .where("aggregate_id", "=", organization.id)
        .orderBy("occurred_at", "asc")
        .execute(),
    ).toEqual([
      { event_type: "organization.suspended" },
      { event_type: "organization.unsuspended" },
    ]);
  });
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
    const responses = await Promise.all(
      ["First", "Second"].map((suffix) =>
        app.inject({
          method: "POST",
          url: "/api/organization-requests",
          headers: { "x-test-user": userId },
          payload: { ...validRequest, name: `${validRequest.name} ${suffix}` },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(
      responses.find((response) => response.statusCode === 409)?.json().code,
    ).toBe("ORGANIZATION_REQUEST_PENDING");
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

  it.each(["owner", "manager", "staff"] as const)(
    "allows a user with an existing %s membership to request another organization",
    async (role) => {
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
          role,
        })
        .execute();

      const response = await app.inject({
        method: "POST",
        url: "/api/organization-requests",
        headers: { "x-test-user": userId },
        payload: validRequest,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        name: validRequest.name,
        status: "pending",
      });
      expect(
        await db
          .selectFrom("membership")
          .select("role")
          .where("organization_id", "=", organization.id)
          .where("user_id", "=", userId)
          .executeTakeFirstOrThrow(),
      ).toEqual({ role });
    },
  );
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

  it("paginates organizations without losing sub-millisecond rows", async () => {
    const f = await fixture();
    const ids: string[] = [];
    for (const createdAt of [
      "2026-10-05T12:00:00.123800Z",
      "2026-10-05T12:00:00.123900Z",
    ]) {
      const organization = await db
        .insertInto("organization")
        .values({
          name: `Organization ${createdAt}`,
          slug: `org-${randomUUID()}`,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await sql`UPDATE organization SET created_at = ${createdAt}::timestamptz WHERE id = ${organization.id}::uuid`.execute(
        db,
      );
      ids.push(organization.id);
    }

    const first = await app.inject({
      method: "GET",
      url: "/api/platform/organizations?limit=1",
      headers: { "x-test-user": f.adminId },
    });
    const firstPage = first.json();
    const second = await app.inject({
      method: "GET",
      url: `/api/platform/organizations?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      headers: { "x-test-user": f.adminId },
    });
    expect([firstPage.items[0].id, second.json().items[0].id]).toEqual(
      ids.reverse(),
    );
  });

  it("filters the directory by exclusive lifecycle and searches name, slug, and owner email", async () => {
    const f = await fixture();
    const ownerId = await createUser("Directory owner");
    const owner = await db
      .selectFrom("user")
      .select("email")
      .where("id", "=", ownerId)
      .executeTakeFirstOrThrow();
    for (const [name, state] of [
      ["Active Needle", "active"],
      ["Suspended Needle", "suspended"],
      ["Archived Needle", "archived"],
    ] as const) {
      const organization = await db
        .insertInto("organization")
        .values({
          name,
          slug: `${state}-needle-${randomUUID()}`,
          suspended_at: state === "suspended" ? new Date() : null,
          archived_at: state === "archived" ? new Date() : null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .insertInto("membership")
        .values({
          organization_id: organization.id,
          user_id: ownerId,
          role: "owner",
        })
        .execute();
    }

    for (const [lifecycle, expectedName] of [
      ["active", "Active Needle"],
      ["suspended", "Suspended Needle"],
      ["archived", "Archived Needle"],
    ] as const) {
      const response = await app.inject({
        method: "GET",
        url: `/api/platform/organizations?lifecycle=${lifecycle}&search=needle`,
        headers: { "x-test-user": f.adminId },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([
        expect.objectContaining({ name: expectedName }),
      ]);
    }
    const byOwner = await app.inject({
      method: "GET",
      url: `/api/platform/organizations?lifecycle=all&search=${encodeURIComponent(owner.email)}`,
      headers: { "x-test-user": f.adminId },
    });
    expect(byOwner.json().items).toHaveLength(3);
    const invalid = await app.inject({
      method: "GET",
      url: "/api/platform/organizations?lifecycle=deleted",
      headers: { "x-test-user": f.adminId },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
