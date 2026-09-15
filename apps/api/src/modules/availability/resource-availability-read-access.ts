import type { Transaction } from "kysely";
import type { Database } from "../../db-types.js";
import { canManageResourceAvailability } from "./resource-availability-policy.js";

export type ResourceAvailabilityReadInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
};

export async function authorizeResourceAvailabilityRead(
  trx: Transaction<Database>,
  input: ResourceAvailabilityReadInput,
) {
  const memberships = await trx
    .selectFrom("membership")
    .select(["user_id", "role"])
    .where("organization_id", "=", input.organizationId)
    .execute();
  const actor = memberships.find((member) => member.user_id === input.userId);
  if (!actor)
    return { ok: false as const, reason: "organization_not_found" as const };
  const resource = await trx
    .selectFrom("resource")
    .select("user_id")
    .where("id", "=", input.resourceId)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirst();
  if (!resource)
    return { ok: false as const, reason: "resource_not_found" as const };
  if (!canManageResourceAvailability(actor, resource.user_id, memberships))
    return { ok: false as const, reason: "insufficient_role" as const };
  return { ok: true as const };
}
