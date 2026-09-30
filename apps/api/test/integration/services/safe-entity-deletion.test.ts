import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import type { BookingStatus, MembershipRole } from "../../../src/db-types.js";
import { deleteResource } from "../../../src/modules/resources/application/delete.js";
import { deleteService } from "../../../src/modules/services/application/delete.js";
import {
  addTestMembership,
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

async function fixture(role: MembershipRole = "owner") {
  const actor = await createTestUser();
  const organization = await createTestOrganization();
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role,
  });
  const resource = await createTestResource({
    organizationId: organization.id,
    deactivatedAt: new Date(),
  });
  const service = await createTestService({
    organizationId: organization.id,
    deactivatedAt: new Date(),
  });
  await db
    .insertInto("resource_service")
    .values({
      organization_id: organization.id,
      resource_id: resource.id,
      service_id: service.id,
    })
    .execute();
  return { actor, organization, resource, service };
}

async function addBooking(
  f: Awaited<ReturnType<typeof fixture>>,
  status: BookingStatus,
) {
  return createTestBooking({
    organizationId: f.organization.id,
    resourceId: f.resource.id,
    serviceId: f.service.id,
    publicReference: `SAFE-${randomUUID()}`,
    startAt: new Date("2026-10-05T06:00:00.000Z"),
    durationMinutes: 30,
    bufferAfterMinutes: 0,
    status,
    cancelledAt: status === "cancelled" ? new Date() : null,
  });
}

describe("safe Service and Resource deletion", () => {
  it("deletes inactive unused entities and their configuration assignments", async () => {
    const f = await fixture();
    expect(
      await deleteService({
        userId: f.actor.id,
        organizationId: f.organization.id,
        serviceId: f.service.id,
      }),
    ).toEqual({ ok: true });
    expect(
      await db
        .selectFrom("resource_service")
        .select("service_id")
        .where("service_id", "=", f.service.id)
        .execute(),
    ).toEqual([]);

    const otherService = await createTestService({
      organizationId: f.organization.id,
    });
    await db
      .insertInto("resource_service")
      .values({
        organization_id: f.organization.id,
        resource_id: f.resource.id,
        service_id: otherService.id,
      })
      .execute();
    expect(
      await deleteResource({
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
      }),
    ).toEqual({ ok: true });
    expect(
      await db
        .selectFrom("resource_service")
        .select("resource_id")
        .where("resource_id", "=", f.resource.id)
        .execute(),
    ).toEqual([]);
  });

  it.each(["confirmed", "cancelled", "no_show"] as const)(
    "%s Booking history blocks both entity deletions",
    async (status) => {
      const f = await fixture();
      await addBooking(f, status);
      expect(
        await deleteService({
          userId: f.actor.id,
          organizationId: f.organization.id,
          serviceId: f.service.id,
        }),
      ).toEqual({ ok: false, reason: "service_has_booking_history" });
      expect(
        await deleteResource({
          userId: f.actor.id,
          organizationId: f.organization.id,
          resourceId: f.resource.id,
        }),
      ).toEqual({ ok: false, reason: "resource_has_booking_history" });
    },
  );

  it("requires inactive entities, blocks linked Resources, rejects Staff, and hides cross-tenant targets", async () => {
    const f = await fixture();
    await db
      .updateTable("service")
      .set({ deactivated_at: null })
      .where("id", "=", f.service.id)
      .execute();
    await db
      .updateTable("resource")
      .set({ deactivated_at: null })
      .where("id", "=", f.resource.id)
      .execute();
    expect(
      await deleteService({
        userId: f.actor.id,
        organizationId: f.organization.id,
        serviceId: f.service.id,
      }),
    ).toEqual({ ok: false, reason: "service_must_be_inactive" });
    expect(
      await deleteResource({
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
      }),
    ).toEqual({ ok: false, reason: "resource_must_be_inactive" });

    await db
      .updateTable("resource")
      .set({ deactivated_at: new Date(), user_id: f.actor.id })
      .where("id", "=", f.resource.id)
      .execute();
    expect(
      await deleteResource({
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
      }),
    ).toEqual({ ok: false, reason: "resource_linked_to_member" });

    const staff = await fixture("staff");
    expect(
      await deleteService({
        userId: staff.actor.id,
        organizationId: staff.organization.id,
        serviceId: staff.service.id,
      }),
    ).toEqual({ ok: false, reason: "insufficient_role" });
    const other = await fixture();
    expect(
      await deleteService({
        userId: f.actor.id,
        organizationId: f.organization.id,
        serviceId: other.service.id,
      }),
    ).toEqual({ ok: false, reason: "service_not_found" });
  });
});
