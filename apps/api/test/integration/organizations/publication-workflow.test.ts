import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import { archiveOrganization } from "../../../src/modules/organizations/application/lifecycle.js";
import { suspendOrganization } from "../../../src/modules/organizations/application/suspension.js";
import { organizationRoutes } from "../../../src/modules/organizations/http/index.js";
import {
  addTestMembership,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

vi.mock("../../../src/http/auth-guard.js", () => ({
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
await app.register(organizationRoutes);
afterAll(() => app.close());

async function memberFixture(role: "owner" | "manager" | "staff" = "owner") {
  const user = await createTestUser({ name: `${role} user` });
  const organization = await createTestOrganization({
    name: "Publication organization",
  });
  await addTestMembership({
    userId: user.id,
    organizationId: organization.id,
    role,
  });
  return { user, organization };
}

async function addPlatformAdmin() {
  const user = await createTestUser({ name: "Platform reviewer" });
  await db
    .insertInto("platform_admin")
    .values({ user_id: user.id, revoked_at: null })
    .execute();
  return user;
}

async function completeSetup(
  organizationId: string,
  options: { priceAgorot?: number | null } = {},
) {
  const service = await createTestService({
    organizationId,
    name: "Haircut",
    priceAgorot: options.priceAgorot ?? null,
  });
  const resource = await createTestResource({
    organizationId,
    name: "Chair one",
  });
  await db
    .insertInto("resource_service")
    .values({
      organization_id: organizationId,
      service_id: service.id,
      resource_id: resource.id,
    })
    .execute();
  await db
    .insertInto("organization_weekly_hours")
    .values({
      organization_id: organizationId,
      weekday: 1,
      start_minute: 540,
      end_minute: 1020,
    })
    .execute();
  return { service, resource };
}

function inject(
  method: "GET" | "PATCH" | "POST",
  url: string,
  userId: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    headers: { "x-test-user": userId },
    ...(payload ? { payload } : {}),
  });
}

describe("Organization pricing mode", () => {
  it("enables only when every active Service is priced and returns blockers atomically", async () => {
    const f = await memberFixture();
    const priced = await createTestService({
      organizationId: f.organization.id,
      name: "Priced",
      priceAgorot: 5000,
    });
    const missing = await createTestService({
      organizationId: f.organization.id,
      name: "Missing price",
      displayOrder: 1,
    });
    const url = `/api/organizations/${f.organization.id}/settings/pricing`;

    const blocked = await inject("PATCH", url, f.user.id, {
      pricingEnabled: true,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      code: "ACTIVE_SERVICES_MISSING_PRICE",
      services: [{ serviceId: missing.id, serviceName: "Missing price" }],
    });
    expect(
      await db
        .selectFrom("organization")
        .select("pricing_enabled")
        .where("id", "=", f.organization.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ pricing_enabled: false });

    await db
      .updateTable("service")
      .set({ price_agorot: 0 })
      .where("id", "=", missing.id)
      .execute();
    const enabled = await inject("PATCH", url, f.user.id, {
      pricingEnabled: true,
    });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json()).toEqual({ pricingEnabled: true });

    const disabled = await inject("PATCH", url, f.user.id, {
      pricingEnabled: false,
    });
    expect(disabled.statusCode).toBe(200);
    expect(
      await db
        .selectFrom("service")
        .select(["id", "price_agorot"])
        .where("organization_id", "=", f.organization.id)
        .orderBy("display_order")
        .execute(),
    ).toEqual([
      { id: priced.id, price_agorot: 5000 },
      { id: missing.id, price_agorot: 0 },
    ]);
  });

  it("allows Managers to read pricing but only Owners to change it", async () => {
    const owner = await memberFixture();
    const manager = await createTestUser();
    await addTestMembership({
      userId: manager.id,
      organizationId: owner.organization.id,
      role: "manager",
    });
    expect(
      (
        await inject(
          "GET",
          `/api/organizations/${owner.organization.id}/settings`,
          manager.id,
        )
      ).statusCode,
    ).toBe(200);
    const response = await inject(
      "PATCH",
      `/api/organizations/${owner.organization.id}/settings/pricing`,
      manager.id,
      { pricingEnabled: true },
    );
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("ORGANIZATION_OWNER_REQUIRED");
  });
});

describe("publication readiness and owner requests", () => {
  it("returns structural blockers and does not treat pause as a blocker", async () => {
    const f = await memberFixture();
    const url = `/api/organizations/${f.organization.id}/publication-readiness`;
    const empty = await inject("GET", url, f.user.id);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({ ready: false });
    expect(
      empty.json().checks.filter((check: { ready: boolean }) => !check.ready),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "active_service" }),
        expect.objectContaining({ code: "active_resource" }),
        expect.objectContaining({ code: "working_hours" }),
      ]),
    );

    await completeSetup(f.organization.id);
    await db
      .updateTable("organization")
      .set({ public_booking_paused: true })
      .where("id", "=", f.organization.id)
      .execute();
    const ready = await inject("GET", url, f.user.id);
    expect(ready.json()).toMatchObject({ ready: true });
    expect(
      ready
        .json()
        .checks.some(
          (check: { code: string }) => check.code === "public_booking_paused",
        ),
    ).toBe(false);
  });

  it("uses the same missing-price blocker data for readiness", async () => {
    const f = await memberFixture();
    const { service } = await completeSetup(f.organization.id);
    await db
      .updateTable("organization")
      .set({ pricing_enabled: true })
      .where("id", "=", f.organization.id)
      .execute();
    const response = await inject(
      "GET",
      `/api/organizations/${f.organization.id}/publication-readiness`,
      f.user.id,
    );
    expect(response.json()).toMatchObject({
      ready: false,
      checks: expect.arrayContaining([
        {
          code: "service_prices",
          ready: false,
          applicable: true,
          services: [{ serviceId: service.id, serviceName: service.name }],
        },
      ]),
    });
  });

  it("allows one concurrent Owner request, writes its outbox event, and rejects Managers", async () => {
    const f = await memberFixture();
    await completeSetup(f.organization.id);
    const manager = await createTestUser();
    await addTestMembership({
      organizationId: f.organization.id,
      userId: manager.id,
      role: "manager",
    });
    const url = `/api/organizations/${f.organization.id}/publication-requests`;
    const forbidden = await inject("POST", url, manager.id);
    expect(forbidden.statusCode).toBe(403);

    const responses = await Promise.all([
      inject("POST", url, f.user.id),
      inject("POST", url, f.user.id),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    const requests = await db
      .selectFrom("organization_publication_request")
      .selectAll()
      .execute();
    expect(requests).toHaveLength(1);
    expect(
      await db
        .selectFrom("outbox_event")
        .select(["aggregate_id", "event_type"])
        .where("event_type", "=", "organization.publication_requested")
        .execute(),
    ).toEqual([
      {
        aggregate_id: requests[0]?.id,
        event_type: "organization.publication_requested",
      },
    ]);
  });
});

describe("Platform publication decisions", () => {
  async function requestedFixture() {
    const owner = await memberFixture();
    await completeSetup(owner.organization.id);
    const response = await inject(
      "POST",
      `/api/organizations/${owner.organization.id}/publication-requests`,
      owner.user.id,
    );
    expect(response.statusCode).toBe(201);
    const admin = await addPlatformAdmin();
    return { ...owner, admin, requestId: response.json().id as string };
  }

  it("rechecks live readiness, keeps a degraded request pending, then publishes", async () => {
    const f = await requestedFixture();
    await db
      .deleteFrom("organization_weekly_hours")
      .where("organization_id", "=", f.organization.id)
      .execute();
    const url = `/api/platform/publication-requests/${f.requestId}/publish`;
    const blocked = await inject("POST", url, f.admin.id);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      code: "PUBLICATION_READINESS_CHANGED",
      readiness: { ready: false },
    });
    expect(
      await db
        .selectFrom("organization_publication_request")
        .select("status")
        .where("id", "=", f.requestId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "pending" });

    await db
      .insertInto("organization_weekly_hours")
      .values({
        organization_id: f.organization.id,
        weekday: 1,
        start_minute: 540,
        end_minute: 1020,
      })
      .execute();
    const published = await inject("POST", url, f.admin.id);
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({
      request: { status: "approved" },
      organization: { id: f.organization.id },
    });
  });

  it("serializes publish/reject and allows a new request after rejection", async () => {
    const f = await requestedFixture();
    const [publish, reject] = await Promise.all([
      inject(
        "POST",
        `/api/platform/publication-requests/${f.requestId}/publish`,
        f.admin.id,
      ),
      inject(
        "POST",
        `/api/platform/publication-requests/${f.requestId}/reject`,
        f.admin.id,
        { reason: "Please clarify the setup" },
      ),
    ]);
    expect([publish.statusCode, reject.statusCode].sort()).toEqual([200, 409]);
    expect(
      await db
        .selectFrom("organization_publication_request")
        .select("status")
        .where("id", "=", f.requestId)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ status: expect.stringMatching(/approved|rejected/) });

    if (reject.statusCode === 200) {
      const next = await inject(
        "POST",
        `/api/organizations/${f.organization.id}/publication-requests`,
        f.user.id,
      );
      expect(next.statusCode).toBe(201);
      expect(next.json().id).not.toBe(f.requestId);
    }
  });

  it("unpublishes without changing archive, suspension, pause, or configuration", async () => {
    const f = await requestedFixture();
    await inject(
      "POST",
      `/api/platform/publication-requests/${f.requestId}/publish`,
      f.admin.id,
    );
    await db
      .updateTable("organization")
      .set({ public_booking_paused: true })
      .where("id", "=", f.organization.id)
      .execute();
    const response = await inject(
      "POST",
      `/api/platform/organizations/${f.organization.id}/unpublish`,
      f.admin.id,
      { reason: "Public listing needs another review" },
    );
    expect(response.statusCode).toBe(200);
    expect(
      await db
        .selectFrom("organization")
        .select([
          "published_at",
          "public_booking_paused",
          "archived_at",
          "suspended_at",
        ])
        .where("id", "=", f.organization.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      published_at: null,
      public_booking_paused: true,
      archived_at: null,
      suspended_at: null,
    });
    expect(
      await db
        .selectFrom("organization_unpublication")
        .select("reason")
        .where("organization_id", "=", f.organization.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ reason: "Public listing needs another review" });
  });

  it("keeps publication approval through suspension and archive", async () => {
    const f = await memberFixture();
    const admin = await addPlatformAdmin();
    const publishedAt = new Date("2026-09-27T10:00:00.000Z");
    await db
      .updateTable("organization")
      .set({ published_at: publishedAt })
      .where("id", "=", f.organization.id)
      .execute();
    expect(
      await suspendOrganization({
        userId: admin.id,
        organizationId: f.organization.id,
        reason: "Test suspension",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await db
        .selectFrom("organization")
        .select("published_at")
        .where("id", "=", f.organization.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ published_at: publishedAt });

    await db
      .updateTable("organization")
      .set({ suspended_at: null })
      .where("id", "=", f.organization.id)
      .execute();
    expect(
      await archiveOrganization({
        userId: f.user.id,
        organizationId: f.organization.id,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await db
        .selectFrom("organization")
        .select("published_at")
        .where("id", "=", f.organization.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ published_at: publishedAt });
  });
});
