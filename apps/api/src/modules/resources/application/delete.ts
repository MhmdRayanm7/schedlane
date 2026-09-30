import { db } from "../../../db.js";
import { lockOrganizationMemberships } from "../../organizations/application/membership-lock.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";

type DeleteResourceFailure =
  | "organization_not_found"
  | "resource_not_found"
  | "insufficient_role"
  | "resource_must_be_inactive"
  | "resource_has_booking_history"
  | "resource_linked_to_member"
  | "resource_has_invitation_history"
  | OrganizationWriteStateFailure;

export type DeleteResourceResult =
  | { ok: true }
  | { ok: false; reason: DeleteResourceFailure };

export async function deleteResource(input: {
  userId: string;
  organizationId: string;
  resourceId: string;
}): Promise<DeleteResourceResult> {
  return db.transaction().execute(async (trx) => {
    const memberships = await lockOrganizationMemberships(
      trx,
      input.organizationId,
    );
    const actor = memberships.find((item) => item.user_id === input.userId);
    if (!actor) return { ok: false, reason: "organization_not_found" };
    if (actor.role === "staff")
      return { ok: false, reason: "insufficient_role" };

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );
    if (!writeState.ok) return writeState;

    const resource = await trx
      .selectFrom("resource")
      .select(["id", "user_id", "deactivated_at"])
      .where("organization_id", "=", input.organizationId)
      .where("id", "=", input.resourceId)
      .forUpdate()
      .executeTakeFirst();
    if (!resource) return { ok: false, reason: "resource_not_found" };
    if (!resource.deactivated_at)
      return { ok: false, reason: "resource_must_be_inactive" };
    if (resource.user_id)
      return { ok: false, reason: "resource_linked_to_member" };

    const booking = await trx
      .selectFrom("booking")
      .select("id")
      .where("organization_id", "=", input.organizationId)
      .where("resource_id", "=", resource.id)
      .limit(1)
      .executeTakeFirst();
    if (booking) return { ok: false, reason: "resource_has_booking_history" };

    const invitation = await trx
      .selectFrom("organization_invitation")
      .select("id")
      .where("organization_id", "=", input.organizationId)
      .where("resource_id", "=", resource.id)
      .limit(1)
      .executeTakeFirst();
    if (invitation)
      return { ok: false, reason: "resource_has_invitation_history" };

    await trx.deleteFrom("resource").where("id", "=", resource.id).execute();
    return { ok: true };
  });
}
