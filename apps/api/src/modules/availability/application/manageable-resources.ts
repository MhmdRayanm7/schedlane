import { db } from "../../../db.js";
import { canManageResourceAvailability } from "../domain/resource-availability-policy.js";

export type ListManageableScheduleResourcesInput = {
  userId: string;
  organizationId: string;
};

export type ManageableScheduleResourceItem = {
  id: string;
  name: string;
  deactivatedAt: string | null;
};

export type ListManageableScheduleResourcesResult =
  | {
      ok: true;
      items: ManageableScheduleResourceItem[];
    }
  | {
      ok: false;
      reason: "organization_not_found" | "insufficient_role";
    };

export async function listManageableScheduleResources(
  input: ListManageableScheduleResourcesInput,
): Promise<ListManageableScheduleResourcesResult> {
  const memberships = await db
    .selectFrom("membership")
    .select(["user_id", "role"])
    .where("organization_id", "=", input.organizationId)
    .execute();

  const actor = memberships.find((member) => member.user_id === input.userId);
  if (!actor) {
    return { ok: false, reason: "organization_not_found" };
  }

  const resources = await db
    .selectFrom("resource")
    .select(["id", "name", "user_id", "deactivated_at"])
    .where("organization_id", "=", input.organizationId)
    .execute();

  const allowed = resources.filter((resource) =>
    canManageResourceAvailability(actor, resource.user_id, memberships),
  );

  allowed.sort((a, b) => {
    const aActive = a.deactivated_at === null ? 0 : 1;
    const bActive = b.deactivated_at === null ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const nameCompare = a.name.localeCompare(b.name);
    if (nameCompare !== 0) return nameCompare;
    return a.id.localeCompare(b.id);
  });

  return {
    ok: true,
    items: allowed.map((resource) => ({
      id: resource.id,
      name: resource.name,
      deactivatedAt: resource.deactivated_at?.toISOString() ?? null,
    })),
  };
}
