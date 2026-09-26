import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import { publicBookingRoutes } from "../../../src/modules/bookings/http/public-routes.js";
import { createTestOrganization } from "../../helpers/factories.js";

const app = Fastify();
await app.register(publicBookingRoutes, {
  now: () => new Date("2026-10-04T22:07:30.000Z"),
});
afterAll(() => app.close());

const publishedAt = new Date("2026-09-01T00:00:00.000Z");

type ServiceInput = {
  id: string;
  organizationId: string;
  name: string;
  displayOrder: number;
  durationMinutes?: number;
  priceAgorot?: number | null;
  deactivatedAt?: Date | null;
};

async function createService({
  id,
  organizationId,
  name,
  displayOrder,
  durationMinutes = 30,
  priceAgorot = null,
  deactivatedAt = null,
}: ServiceInput) {
  return db
    .insertInto("service")
    .values({
      id,
      organization_id: organizationId,
      name,
      display_order: displayOrder,
      duration_minutes: durationMinutes,
      price_agorot: priceAgorot,
      deactivated_at: deactivatedAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

type ResourceInput = {
  id: string;
  organizationId: string;
  name: string;
  deactivatedAt?: Date | null;
};

async function createResource({
  id,
  organizationId,
  name,
  deactivatedAt = null,
}: ResourceInput) {
  return db
    .insertInto("resource")
    .values({
      id,
      organization_id: organizationId,
      name,
      deactivated_at: deactivatedAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function assign(
  organizationId: string,
  resourceId: string,
  serviceId: string,
) {
  await db
    .insertInto("resource_service")
    .values({
      organization_id: organizationId,
      resource_id: resourceId,
      service_id: serviceId,
    })
    .execute();
}

function request(slug: string) {
  return app.inject({
    method: "GET",
    url: `/api/public/organizations/${encodeURIComponent(slug)}/booking-context`,
  });
}

function expectPublicNotFound(response: {
  statusCode: number;
  json: () => unknown;
}) {
  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({
    code: "PUBLIC_BOOKING_CONTEXT_NOT_FOUND",
    message: "Public booking option not found",
    requestId: expect.any(String),
  });
}

describe("public Booking context", () => {
  it("returns the exact service-centric public catalog without authentication", async () => {
    const organization = await createTestOrganization({
      slug: "acme-barbers",
      name: "Acme Barbers",
      publishedAt,
    });
    const secondService = await createService({
      id: "00000000-0000-4000-8000-000000000102",
      organizationId: organization.id,
      name: "Consultation",
      displayOrder: 10,
      durationMinutes: 15,
      priceAgorot: null,
    });
    const firstService = await createService({
      id: "00000000-0000-4000-8000-000000000101",
      organizationId: organization.id,
      name: "Haircut",
      displayOrder: 10,
      durationMinutes: 30,
      priceAgorot: 7000,
    });
    const alexFirst = await createResource({
      id: "00000000-0000-4000-8000-000000000201",
      organizationId: organization.id,
      name: "Alex",
    });
    const alexSecond = await createResource({
      id: "00000000-0000-4000-8000-000000000202",
      organizationId: organization.id,
      name: "Alex",
    });
    const shared = await createResource({
      id: "00000000-0000-4000-8000-000000000203",
      organizationId: organization.id,
      name: "Zara",
    });
    const secondOnly = await createResource({
      id: "00000000-0000-4000-8000-000000000204",
      organizationId: organization.id,
      name: "Bella",
    });

    await assign(organization.id, shared.id, firstService.id);
    await assign(organization.id, alexSecond.id, firstService.id);
    await assign(organization.id, alexFirst.id, firstService.id);
    await assign(organization.id, shared.id, secondService.id);
    await assign(organization.id, secondOnly.id, secondService.id);

    const response = await request(organization.slug);

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.json()).toEqual({
      organization: {
        name: "Acme Barbers",
        slug: "acme-barbers",
        timezone: "Asia/Jerusalem",
      },
      bookingWindow: { firstDate: "2026-10-05", lastDate: "2026-12-04" },
      services: [
        {
          id: firstService.id,
          name: "Haircut",
          durationMinutes: 30,
          priceAgorot: 7000,
          resources: [
            { id: alexFirst.id, name: "Alex" },
            { id: alexSecond.id, name: "Alex" },
            { id: shared.id, name: "Zara" },
          ],
        },
        {
          id: secondService.id,
          name: "Consultation",
          durationMinutes: 15,
          priceAgorot: null,
          resources: [
            { id: secondOnly.id, name: "Bella" },
            { id: shared.id, name: "Zara" },
          ],
        },
      ],
    });
  });

  it("excludes inactive, unassigned, empty, and other-tenant catalog data", async () => {
    const organization = await createTestOrganization({ publishedAt });
    const otherOrganization = await createTestOrganization({ publishedAt });
    const visibleService = await createService({
      id: "00000000-0000-4000-8000-000000000301",
      organizationId: organization.id,
      name: "Visible service",
      displayOrder: 2,
    });
    const emptyService = await createService({
      id: "00000000-0000-4000-8000-000000000302",
      organizationId: organization.id,
      name: "Empty service",
      displayOrder: 0,
    });
    const inactiveService = await createService({
      id: "00000000-0000-4000-8000-000000000303",
      organizationId: organization.id,
      name: "Inactive service",
      displayOrder: 1,
      deactivatedAt: new Date(),
    });
    const otherService = await createService({
      id: "00000000-0000-4000-8000-000000000304",
      organizationId: otherOrganization.id,
      name: "Other tenant service",
      displayOrder: 0,
    });
    const visibleResource = await createResource({
      id: "00000000-0000-4000-8000-000000000401",
      organizationId: organization.id,
      name: "Visible resource",
    });
    const inactiveResource = await createResource({
      id: "00000000-0000-4000-8000-000000000402",
      organizationId: organization.id,
      name: "Inactive resource",
      deactivatedAt: new Date(),
    });
    const unassignedResource = await createResource({
      id: "00000000-0000-4000-8000-000000000403",
      organizationId: organization.id,
      name: "Unassigned resource",
    });
    const otherResource = await createResource({
      id: "00000000-0000-4000-8000-000000000404",
      organizationId: otherOrganization.id,
      name: "Other tenant resource",
    });

    await assign(organization.id, visibleResource.id, visibleService.id);
    await assign(organization.id, inactiveResource.id, visibleService.id);
    await assign(organization.id, visibleResource.id, inactiveService.id);
    await assign(otherOrganization.id, otherResource.id, otherService.id);

    const response = await request(organization.slug);

    expect(response.statusCode).toBe(200);
    expect(response.json().services).toEqual([
      {
        id: visibleService.id,
        name: "Visible service",
        durationMinutes: 30,
        priceAgorot: null,
        resources: [{ id: visibleResource.id, name: "Visible resource" }],
      },
    ]);
    expect(JSON.stringify(response.json())).not.toContain(emptyService.id);
    expect(JSON.stringify(response.json())).not.toContain(
      unassignedResource.id,
    );
    expect(JSON.stringify(response.json())).not.toContain(otherOrganization.id);
  });

  it("orders Services by display order before id", async () => {
    const organization = await createTestOrganization({ publishedAt });
    const later = await createService({
      id: "00000000-0000-4000-8000-000000000501",
      organizationId: organization.id,
      name: "Later",
      displayOrder: 5,
    });
    const earlier = await createService({
      id: "00000000-0000-4000-8000-000000000502",
      organizationId: organization.id,
      name: "Earlier",
      displayOrder: 1,
    });
    const resource = await createResource({
      id: "00000000-0000-4000-8000-000000000503",
      organizationId: organization.id,
      name: "Resource",
    });
    await assign(organization.id, resource.id, later.id);
    await assign(organization.id, resource.id, earlier.id);

    expect((await request(organization.slug)).json().services).toEqual([
      expect.objectContaining({ id: earlier.id }),
      expect.objectContaining({ id: later.id }),
    ]);
  });

  it("collapses every unavailable Organization state into one public 404", async () => {
    expectPublicNotFound(await request("unknown-organization"));

    const unavailable = [
      await createTestOrganization({ slug: "unpublished" }),
      await createTestOrganization({
        slug: "archived",
        archivedAt: new Date(),
      }),
      await createTestOrganization({
        slug: "suspended",
        publishedAt,
        suspendedAt: new Date(),
      }),
      await createTestOrganization({
        slug: "paused",
        publishedAt,
        publicBookingPaused: true,
      }),
    ];

    for (const organization of unavailable)
      expectPublicNotFound(await request(organization.slug));
  });

  it("uses the injected Jerusalem date and configured horizon", async () => {
    const organization = await createTestOrganization({ publishedAt });
    await db
      .updateTable("organization")
      .set({ max_booking_horizon_days: 2 })
      .where("id", "=", organization.id)
      .execute();
    expect((await request(organization.slug)).json().bookingWindow).toEqual({
      firstDate: "2026-10-05",
      lastDate: "2026-10-07",
    });
  });
});
