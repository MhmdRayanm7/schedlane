import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import type { MembershipRole } from "../../../src/db-types.js";
import { getManualBookingContext } from "../../../src/modules/bookings/application/manual-context.js";
import { getManualBookingOptions } from "../../../src/modules/bookings/application/manual-options.js";
import {
  addTestMembership,
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

const date = "2026-10-05";
const now = new Date("2026-10-05T06:00:00.000Z");

async function fixture(
  role: MembershipRole = "owner",
  linked = role === "staff",
) {
  const actor = await createTestUser();
  const organization = await createTestOrganization({
    publicBookingPaused: true,
  });
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role,
  });
  const resource = await createTestResource({
    organizationId: organization.id,
    userId: linked ? actor.id : null,
    name: "Allowed resource",
  });
  const otherResource = await createTestResource({
    organizationId: organization.id,
    name: "Other resource",
  });
  const service = await createTestService({
    organizationId: organization.id,
    name: "Assigned service",
    durationMinutes: 30,
    bufferAfterMinutes: 15,
  });
  await db
    .insertInto("organization_weekly_hours")
    .values({
      organization_id: organization.id,
      weekday: 1,
      start_minute: 540,
      end_minute: 720,
    })
    .execute();
  await db
    .insertInto("resource_service")
    .values({
      organization_id: organization.id,
      resource_id: resource.id,
      service_id: service.id,
    })
    .execute();
  return { actor, organization, resource, otherResource, service };
}

describe("manual Booking context and options", () => {
  it.each(["owner", "manager"] as const)(
    "returns active assigned choices for %s without public gating",
    async (role) => {
      const f = await fixture(role);
      const result = await getManualBookingContext({
        userId: f.actor.id,
        organizationId: f.organization.id,
      });
      expect(result).toMatchObject({
        ok: true,
        context: {
          role,
          resources: [
            { id: f.resource.id, services: [{ id: f.service.id }] },
            { id: f.otherResource.id, services: [] },
          ],
        },
      });
    },
  );

  it("limits Staff context and options to the linked Resource", async () => {
    const f = await fixture("staff", true);
    expect(
      await getManualBookingContext({
        userId: f.actor.id,
        organizationId: f.organization.id,
      }),
    ).toMatchObject({
      ok: true,
      context: { resources: [{ id: f.resource.id }] },
    });
    expect(
      await getManualBookingOptions(
        {
          userId: f.actor.id,
          organizationId: f.organization.id,
          resourceId: f.otherResource.id,
          serviceId: f.service.id,
          date,
        },
        now,
      ),
    ).toEqual({ ok: false, reason: "insufficient_role" });
  });

  it("returns an intentional empty context for Staff without a linked Resource", async () => {
    const f = await fixture("staff", false);
    expect(
      await getManualBookingContext({
        userId: f.actor.id,
        organizationId: f.organization.id,
      }),
    ).toMatchObject({ ok: true, context: { role: "staff", resources: [] } });
  });

  it("returns real free starts, including now, while excluding past and occupancy", async () => {
    const f = await fixture();
    await createTestBooking({
      organizationId: f.organization.id,
      resourceId: f.resource.id,
      serviceId: f.service.id,
      publicReference: "MANUAL-OPTIONS-OCCUPIED",
      startAt: new Date("2026-10-05T07:00:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 15,
    });
    const result = await getManualBookingOptions(
      {
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
      },
      now,
    );
    expect(result).toMatchObject({
      ok: true,
      options: {
        timezone: "Asia/Jerusalem",
        date,
        resourceId: f.resource.id,
        serviceId: f.service.id,
      },
    });
    if (!result.ok) throw new Error("Expected options");
    expect(result.options.starts).toContain(540);
    expect(result.options.starts).not.toContain(525);
    expect(result.options.starts).not.toContain(600);
  });

  it.each([
    ["archived_at", "organization_archived"],
    ["suspended_at", "organization_suspended"],
  ] as const)("blocks %s organizations", async (column, reason) => {
    const f = await fixture();
    await db
      .updateTable("organization")
      .set({ [column]: new Date() })
      .where("id", "=", f.organization.id)
      .execute();
    expect(
      await getManualBookingContext({
        userId: f.actor.id,
        organizationId: f.organization.id,
      }),
    ).toEqual({ ok: false, reason });
  });
});
