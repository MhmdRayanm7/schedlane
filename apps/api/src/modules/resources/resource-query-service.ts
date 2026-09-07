import { db } from "../../db.js";

type ListOrganizationResourcesInput = {
  userId: string;
  organizationId: string;
};

type ListOrganizationResourcesFailure =
  | "organization_not_found"
  | "insufficient_role";

export type ListOrganizationResourcesResult =
  | {
      ok: true;
      items: Array<{
        id: string;
        name: string;
        isLinked: boolean;
        deactivatedAt: string | null;
        createdAt: string;
      }>;
    }
  | {
      ok: false;
      reason: ListOrganizationResourcesFailure;
    };

export async function listOrganizationResources(
  input: ListOrganizationResourcesInput,
): Promise<ListOrganizationResourcesResult> {
  const membership = await db
    .selectFrom("membership")
    .select("role")
    .where("organization_id", "=", input.organizationId)
    .where("user_id", "=", input.userId)
    .executeTakeFirst();

  if (!membership) {
    return {
      ok: false,
      reason: "organization_not_found",
    };
  }

  // This endpoint is the management view; Staff-specific visibility comes separately.
  if (membership.role === "staff") {
    return {
      ok: false,
      reason: "insufficient_role",
    };
  }

  const resources = await db
    .selectFrom("resource")
    .select(["id", "name", "user_id", "deactivated_at", "created_at"])
    .where("organization_id", "=", input.organizationId)
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .execute();

  return {
    ok: true,
    items: resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      isLinked: resource.user_id !== null,
      deactivatedAt: resource.deactivated_at?.toISOString() ?? null,
      createdAt: resource.created_at.toISOString(),
    })),
  };
}
