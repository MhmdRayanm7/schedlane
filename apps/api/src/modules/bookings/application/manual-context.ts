import { db } from "../../../db.js";
import type { MembershipRole } from "../../../db-types.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";
import { canManageBookingForResource } from "../domain/policy.js";

export type ManualBookingContext = {
  role: MembershipRole;
  resources: Array<{
    id: string;
    name: string;
    services: Array<{
      id: string;
      name: string;
      durationMinutes: number;
      bufferAfterMinutes: number;
      priceAgorot: number | null;
    }>;
  }>;
};

export type GetManualBookingContextResult =
  | { ok: true; context: ManualBookingContext }
  | {
      ok: false;
      reason: "organization_not_found" | OrganizationWriteStateFailure;
    };

export async function getManualBookingContext(input: {
  userId: string;
  organizationId: string;
}): Promise<GetManualBookingContextResult> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const membership = await trx
        .selectFrom("membership")
        .select("role")
        .where("organization_id", "=", input.organizationId)
        .where("user_id", "=", input.userId)
        .executeTakeFirst();
      if (!membership) return { ok: false, reason: "organization_not_found" };

      const writeState = await requireWritableOrganization(
        trx,
        input.organizationId,
      );
      if (!writeState.ok) return writeState;

      const resources = await trx
        .selectFrom("resource")
        .select(["id", "name", "user_id"])
        .where("organization_id", "=", input.organizationId)
        .where("deactivated_at", "is", null)
        .orderBy("name", "asc")
        .orderBy("id", "asc")
        .execute();
      const actor = { userId: input.userId, role: membership.role };
      const allowedResources = resources.filter((resource) =>
        canManageBookingForResource(actor, resource.user_id),
      );
      const resourceIds = allowedResources.map((resource) => resource.id);
      const services =
        resourceIds.length === 0
          ? []
          : await trx
              .selectFrom("resource_service")
              .innerJoin("service", (join) =>
                join
                  .onRef("service.id", "=", "resource_service.service_id")
                  .onRef(
                    "service.organization_id",
                    "=",
                    "resource_service.organization_id",
                  ),
              )
              .select([
                "resource_service.resource_id",
                "service.id",
                "service.name",
                "service.duration_minutes",
                "service.buffer_after_minutes",
                "service.price_agorot",
              ])
              .where(
                "resource_service.organization_id",
                "=",
                input.organizationId,
              )
              .where("resource_service.resource_id", "in", resourceIds)
              .where("service.deactivated_at", "is", null)
              .orderBy("service.display_order", "asc")
              .orderBy("service.id", "asc")
              .execute();

      return {
        ok: true,
        context: {
          role: membership.role,
          resources: allowedResources.map((resource) => ({
            id: resource.id,
            name: resource.name,
            services: services
              .filter((service) => service.resource_id === resource.id)
              .map((service) => ({
                id: service.id,
                name: service.name,
                durationMinutes: service.duration_minutes,
                bufferAfterMinutes: service.buffer_after_minutes,
                priceAgorot: service.price_agorot,
              })),
          })),
        },
      };
    });
}
