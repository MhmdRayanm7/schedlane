import { db } from "../../db.js";
import type { MembershipRole } from "../../db-types.js";

type ListOrganizationMembersInput = {
  userId: string;
  organizationId: string;
};

type OrganizationMemberDirectoryItem = {
  name: string;
  role: MembershipRole;
  isSelf: boolean;
};

export type ListOrganizationMembersResult =
  | {
      ok: true;
      items: OrganizationMemberDirectoryItem[];
    }
  | {
      ok: false;
      reason: "organization_not_found";
    };

export async function listOrganizationMembers(
  input: ListOrganizationMembersInput,
): Promise<ListOrganizationMembersResult> {
  // The viewer membership is joined separately so visibility is enforced by the query.
  const rows = await db
    .selectFrom("membership as target_membership")
    .innerJoin(
      "user as target_user",
      "target_user.id",
      "target_membership.user_id",
    )
    .innerJoin("membership as viewer_membership", (join) =>
      join
        .onRef(
          "viewer_membership.organization_id",
          "=",
          "target_membership.organization_id",
        )
        .on("viewer_membership.user_id", "=", input.userId),
    )
    .innerJoin(
      "organization",
      "organization.id",
      "target_membership.organization_id",
    )
    .select([
      "target_membership.user_id",
      "target_membership.role",
      "target_user.name",
    ])
    .where("target_membership.organization_id", "=", input.organizationId)
    .where((eb) =>
      eb.or([
        eb("viewer_membership.role", "in", ["owner", "manager"]),
        eb("organization.staff_team_visibility", "=", "team"),
        eb("target_membership.user_id", "=", input.userId),
      ]),
    )
    .orderBy("target_user.name", "asc")
    .execute();

  if (rows.length === 0) {
    return {
      ok: false,
      reason: "organization_not_found",
    };
  }

  return {
    ok: true,
    items: rows.map((row) => ({
      name: row.name,
      role: row.role,
      isSelf: row.user_id === input.userId,
    })),
  };
}
