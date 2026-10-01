import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import { publicAvailabilityRoutes } from "../../../src/modules/availability/http/public-routes.js";
import { publicBookingRoutes } from "../../../src/modules/bookings/http/public-routes.js";
import {
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

const now = new Date("2026-10-05T05:00:00.000Z");
const date = "2026-10-12";
const app = Fastify();
await app.register(publicAvailabilityRoutes, { now: () => now });
await app.register(publicBookingRoutes, { now: () => now });
afterAll(() => app.close());

async function fixture() {
  const owner = await createTestUser();
  const organization = await createTestOrganization({
    publishedAt: new Date("2026-09-01"),
  });
  const service = await createTestService({
    organizationId: organization.id,
    name: "Haircut",
  });
  const otherService = await createTestService({
    organizationId: organization.id,
    name: "Color",
    displayOrder: 1,
  });
  const resource = await createTestResource({
    organizationId: organization.id,
    name: "Mohammad",
  });
  const otherResource = await createTestResource({
    organizationId: organization.id,
    name: "Sara",
  });
  await db
    .insertInto("resource_service")
    .values([
      {
        organization_id: organization.id,
        resource_id: resource.id,
        service_id: service.id,
      },
      {
        organization_id: organization.id,
        resource_id: otherResource.id,
        service_id: service.id,
      },
      {
        organization_id: organization.id,
        resource_id: resource.id,
        service_id: otherService.id,
      },
    ])
    .execute();
  await db
    .insertInto("organization_weekly_hours")
    .values({
      organization_id: organization.id,
      weekday: 1,
      start_minute: 540,
      end_minute: 600,
    })
    .execute();

  async function share(scope: { serviceId?: string; resourceId?: string }) {
    const token = randomBytes(32).toString("base64url");
    const link = await db
      .insertInto("booking_share_link")
      .values({
        organization_id: organization.id,
        token,
        service_id: scope.serviceId ?? null,
        resource_id: scope.resourceId ?? null,
        created_by_user_id: owner.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { token, link };
  }
  const context = (token?: string, slug = organization.slug) =>
    app.inject({
      method: "GET",
      url: `/api/public/organizations/${slug}/booking-context${token === undefined ? "" : `?share=${encodeURIComponent(token)}`}`,
    });
  const availability = (
    token: string,
    serviceId = service.id,
    resourceId = resource.id,
  ) =>
    app.inject({
      method: "GET",
      url: `/api/public/organizations/${organization.slug}/availability?${new URLSearchParams({ serviceId, resourceId, date, share: token })}`,
    });
  const book = (
    token: string,
    serviceId = service.id,
    resourceId = resource.id,
  ) =>
    app.inject({
      method: "POST",
      url: `/api/public/organizations/${organization.slug}/bookings?share=${encodeURIComponent(token)}`,
      payload: {
        serviceId,
        resourceId,
        date,
        startMinute: 540,
        guestName: "Guest",
        guestPhone: "0501234567",
      },
    });
  return {
    owner,
    organization,
    service,
    otherService,
    resource,
    otherResource,
    share,
    context,
    availability,
    book,
  };
}

describe("public booking share scope", () => {
  it("projects Service-only, Resource-only, and combined contexts", async () => {
    const f = await fixture();
    const serviceShare = await f.share({ serviceId: f.service.id });
    const serviceContext = (await f.context(serviceShare.token)).json();
    expect(serviceContext.shareScope).toEqual({
      serviceId: f.service.id,
      resourceId: null,
    });
    expect(serviceContext.services).toEqual([
      expect.objectContaining({
        id: f.service.id,
        resources: [
          { id: f.resource.id, name: "Mohammad" },
          { id: f.otherResource.id, name: "Sara" },
        ],
      }),
    ]);

    const resourceShare = await f.share({ resourceId: f.resource.id });
    const resourceContext = (await f.context(resourceShare.token)).json();
    expect(resourceContext.shareScope).toEqual({
      serviceId: null,
      resourceId: f.resource.id,
    });
    expect(
      resourceContext.services.map(
        (item: { id: string; resources: unknown[] }) => [
          item.id,
          item.resources,
        ],
      ),
    ).toEqual([
      [f.service.id, [{ id: f.resource.id, name: "Mohammad" }]],
      [f.otherService.id, [{ id: f.resource.id, name: "Mohammad" }]],
    ]);

    const both = await f.share({
      serviceId: f.service.id,
      resourceId: f.resource.id,
    });
    expect((await f.context(both.token)).json()).toMatchObject({
      shareScope: { serviceId: f.service.id, resourceId: f.resource.id },
      services: [{ id: f.service.id, resources: [{ id: f.resource.id }] }],
    });
  });

  it("uses one generic unavailable response for invalid, revoked, wrong-tenant, and unusable links", async () => {
    const f = await fixture();
    const scoped = await f.share({
      serviceId: f.service.id,
      resourceId: f.resource.id,
    });
    const other = await fixture();
    const responses = [
      await f.context("invalid"),
      await other.context(scoped.token),
    ];
    await db
      .updateTable("booking_share_link")
      .set({ revoked_at: new Date(), revoked_by_user_id: f.owner.id })
      .where("id", "=", scoped.link.id)
      .execute();
    responses.push(await f.context(scoped.token));
    await db
      .updateTable("booking_share_link")
      .set({ revoked_at: null, revoked_by_user_id: null })
      .where("id", "=", scoped.link.id)
      .execute();
    await db
      .updateTable("service")
      .set({ deactivated_at: new Date() })
      .where("id", "=", f.service.id)
      .execute();
    responses.push(await f.context(scoped.token));
    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        code: "PUBLIC_BOOKING_CONTEXT_NOT_FOUND",
      });
    }
  });

  it("dynamically follows assignment removal/restoration without revoking the link", async () => {
    const f = await fixture();
    const scoped = await f.share({
      serviceId: f.service.id,
      resourceId: f.resource.id,
    });
    expect((await f.context(scoped.token)).statusCode).toBe(200);
    await db
      .deleteFrom("resource_service")
      .where("resource_id", "=", f.resource.id)
      .where("service_id", "=", f.service.id)
      .execute();
    expect((await f.context(scoped.token)).statusCode).toBe(404);
    await db
      .insertInto("resource_service")
      .values({
        organization_id: f.organization.id,
        resource_id: f.resource.id,
        service_id: f.service.id,
      })
      .execute();
    expect((await f.context(scoped.token)).statusCode).toBe(200);
  });

  it("enforces scope in availability and booking creation, including stale tabs after revoke", async () => {
    const f = await fixture();
    const scoped = await f.share({
      serviceId: f.service.id,
      resourceId: f.resource.id,
    });
    expect((await f.availability(scoped.token)).statusCode).toBe(200);
    expect(
      (await f.availability(scoped.token, f.otherService.id)).statusCode,
    ).toBe(404);
    expect(
      (await f.availability(scoped.token, f.service.id, f.otherResource.id))
        .statusCode,
    ).toBe(404);
    expect((await f.context(scoped.token)).statusCode).toBe(200);
    await db
      .updateTable("booking_share_link")
      .set({ revoked_at: new Date(), revoked_by_user_id: f.owner.id })
      .where("id", "=", scoped.link.id)
      .execute();
    const rejected = await f.book(scoped.token);
    expect(rejected.statusCode).toBe(404);
    expect(rejected.json()).toMatchObject({ code: "PUBLIC_BOOKING_NOT_FOUND" });
    expect(await db.selectFrom("booking").select("id").execute()).toEqual([]);
  });

  it("keeps the unscoped context and booking path operational", async () => {
    const f = await fixture();
    expect((await f.context()).json().shareScope).toBeNull();
    const response = await app.inject({
      method: "POST",
      url: `/api/public/organizations/${f.organization.slug}/bookings`,
      payload: {
        serviceId: f.service.id,
        resourceId: f.resource.id,
        date,
        startMinute: 540,
        guestName: "Guest",
        guestPhone: "0501234567",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("confirmed");
  });
});
