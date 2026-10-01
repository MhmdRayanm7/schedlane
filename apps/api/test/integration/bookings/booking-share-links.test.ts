import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import { bookingShareLinkRoutes } from "../../../src/modules/bookings/http/share-link-routes.js";
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
      email: "owner@example.test",
    };
  },
}));

const app = Fastify();
await app.register(bookingShareLinkRoutes);
afterAll(() => app.close());

async function fixture(role: "owner" | "manager" | "staff" = "owner") {
  const user = await createTestUser();
  const organization = await createTestOrganization();
  await addTestMembership({
    userId: user.id,
    organizationId: organization.id,
    role,
  });
  const service = await createTestService({ organizationId: organization.id });
  const resource = await createTestResource({
    organizationId: organization.id,
  });
  await db
    .insertInto("resource_service")
    .values({
      organization_id: organization.id,
      resource_id: resource.id,
      service_id: service.id,
    })
    .execute();
  const base = `/api/organizations/${organization.id}/booking-share-links`;
  const headers = { "x-test-user": user.id };
  return { user, organization, service, resource, base, headers };
}

describe("booking share link management", () => {
  it.each([
    [
      "service",
      (f: Awaited<ReturnType<typeof fixture>>) => ({ serviceId: f.service.id }),
    ],
    [
      "resource",
      (f: Awaited<ReturnType<typeof fixture>>) => ({
        resourceId: f.resource.id,
      }),
    ],
    [
      "combined",
      (f: Awaited<ReturnType<typeof fixture>>) => ({
        serviceId: f.service.id,
        resourceId: f.resource.id,
      }),
    ],
  ] as const)(
    "creates and lists an active %s scope with a server token",
    async (_label, body) => {
      const f = await fixture();
      const response = await app.inject({
        method: "POST",
        url: f.base,
        headers: f.headers,
        payload: body(f),
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        ...body(f),
        token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        revokedAt: null,
      });
      const listed = await app.inject({
        method: "GET",
        url: f.base,
        headers: f.headers,
      });
      expect(listed.json().items).toEqual([response.json()]);
    },
  );

  it("generates independent non-sequential tokens", async () => {
    const f = await fixture();
    const create = () =>
      app.inject({
        method: "POST",
        url: f.base,
        headers: f.headers,
        payload: { serviceId: f.service.id },
      });
    const [first, second] = await Promise.all([create(), create()]);
    expect(first.json().token).not.toBe(second.json().token);
  });

  it("rejects empty, inactive, unassigned, and cross-tenant scopes", async () => {
    const f = await fixture();
    const empty = await app.inject({
      method: "POST",
      url: f.base,
      headers: f.headers,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().code).toBe("BOOKING_SHARE_SCOPE_INVALID");
    await db
      .updateTable("service")
      .set({ deactivated_at: new Date() })
      .where("id", "=", f.service.id)
      .execute();
    expect(
      (
        await app.inject({
          method: "POST",
          url: f.base,
          headers: f.headers,
          payload: { serviceId: f.service.id },
        })
      ).json().code,
    ).toBe("SERVICE_INACTIVE");
    const other = await fixture();
    expect(
      (
        await app.inject({
          method: "POST",
          url: f.base,
          headers: f.headers,
          payload: { resourceId: other.resource.id },
        })
      ).json().code,
    ).toBe("RESOURCE_NOT_FOUND");
    const unassigned = await createTestService({
      organizationId: f.organization.id,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: f.base,
          headers: f.headers,
          payload: { serviceId: unassigned.id, resourceId: f.resource.id },
        })
      ).json().code,
    ).toBe("SERVICE_NOT_ASSIGNED");
  });

  it("revokes terminally and tenant-scopes list/revoke", async () => {
    const f = await fixture();
    const created = await app.inject({
      method: "POST",
      url: f.base,
      headers: f.headers,
      payload: { serviceId: f.service.id },
    });
    const revokeUrl = `${f.base}/${created.json().id}/revoke`;
    expect(
      (await app.inject({ method: "POST", url: revokeUrl, headers: f.headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({ method: "POST", url: revokeUrl, headers: f.headers })
      ).json().code,
    ).toBe("BOOKING_SHARE_LINK_REVOKED");
    const other = await fixture();
    expect(
      (await app.inject({ method: "GET", url: f.base, headers: other.headers }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: revokeUrl,
          headers: other.headers,
        })
      ).statusCode,
    ).toBe(404);
  });

  it.each(["manager", "staff"] as const)(
    "keeps %s read and writes unauthorized",
    async (role) => {
      const f = await fixture(role);
      expect(
        (await app.inject({ method: "GET", url: f.base, headers: f.headers }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: f.base,
            headers: f.headers,
            payload: { serviceId: f.service.id },
          })
        ).statusCode,
      ).toBe(403);
    },
  );
});
