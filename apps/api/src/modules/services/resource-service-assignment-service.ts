import { db } from "../../db.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../organizations/organization-write-policy.js";

type ResourceServiceAssignmentInput = {
  userId: string;
  organizationId: string;
  serviceId: string;
  resourceId: string;
};

export type ResourceServiceAssignmentResult =
  | {
      ok: true;
      assignment: { serviceId: string; resourceId: string; assigned: boolean };
    }
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | "insufficient_role"
        | "service_not_found"
        | "resource_not_found"
        | "service_inactive"
        | "resource_inactive"
        | OrganizationWriteStateFailure;
    };

export function assignResourceToService(input: ResourceServiceAssignmentInput) {
  return setResourceServiceAssignment(input, true);
}

export function unassignResourceFromService(
  input: ResourceServiceAssignmentInput,
) {
  return setResourceServiceAssignment(input, false);
}

async function setResourceServiceAssignment(
  input: ResourceServiceAssignmentInput,
  assigned: boolean,
): Promise<ResourceServiceAssignmentResult> {
  return db.transaction().execute(async (trx) => {
    // Mapping writes always lock actor membership -> organization -> Service -> Resource.
    const membership = await trx
      .selectFrom("membership")
      .select("role")
      .where("organization_id", "=", input.organizationId)
      .where("user_id", "=", input.userId)
      .forUpdate()
      .executeTakeFirst();

    if (!membership) return { ok: false, reason: "organization_not_found" };
    if (membership.role === "staff")
      return { ok: false, reason: "insufficient_role" };

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );
    if (!writeState.ok) return writeState;

    const service = await trx
      .selectFrom("service")
      .select(["id", "deactivated_at"])
      .where("id", "=", input.serviceId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!service) return { ok: false, reason: "service_not_found" };

    const resource = await trx
      .selectFrom("resource")
      .select(["id", "deactivated_at"])
      .where("id", "=", input.resourceId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!resource) return { ok: false, reason: "resource_not_found" };

    if (assigned) {
      if (service.deactivated_at)
        return { ok: false, reason: "service_inactive" };
      if (resource.deactivated_at)
        return { ok: false, reason: "resource_inactive" };

      await trx
        .insertInto("resource_service")
        .values({
          organization_id: input.organizationId,
          service_id: service.id,
          resource_id: resource.id,
        })
        .onConflict((conflict) =>
          conflict.columns(["resource_id", "service_id"]).doNothing(),
        )
        .execute();
    } else {
      // When Bookings exist, check future confirmed dependencies here before deleting.
      await trx
        .deleteFrom("resource_service")
        .where("organization_id", "=", input.organizationId)
        .where("service_id", "=", service.id)
        .where("resource_id", "=", resource.id)
        .execute();
    }

    return {
      ok: true,
      assignment: { serviceId: service.id, resourceId: resource.id, assigned },
    };
  });
}
