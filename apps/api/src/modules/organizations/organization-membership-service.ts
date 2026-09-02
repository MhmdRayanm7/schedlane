import { db } from "../../db.js";
import type { MembershipRole } from "../../db-types.js";

type UpdateOrganizationMemberRoleInput = {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
};

type UpdateOrganizationMemberRoleFailure =
  | "organization_not_found"
  | "member_not_found"
  | "owner_required"
  | "last_owner";

export type UpdateOrganizationMemberRoleResult =
  | {
      ok: true;
      membership: {
        id: string;
        role: MembershipRole;
      };
    }
  | {
      ok: false;
      reason: UpdateOrganizationMemberRoleFailure;
    };

export async function updateOrganizationMemberRole(
  input: UpdateOrganizationMemberRoleInput,
): Promise<UpdateOrganizationMemberRoleResult> {
  return db.transaction().execute(async (trx) => {
    // Membership management is serialized per organization to protect cross-row invariants.
    const memberships = await trx
      .selectFrom("membership")
      .select(["id", "user_id", "role"])
      .where("organization_id", "=", input.organizationId)
      .orderBy("id", "asc")
      .forUpdate()
      .execute();

    const actorMembership = memberships.find(
      (membership) => membership.user_id === input.userId,
    );

    if (!actorMembership) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    // Role assignment is an owner-level organization permission.
    if (actorMembership.role !== "owner") {
      return {
        ok: false,
        reason: "owner_required",
      };
    }

    const targetMembership = memberships.find(
      (membership) => membership.id === input.membershipId,
    );

    if (!targetMembership) {
      return {
        ok: false,
        reason: "member_not_found",
      };
    }

    if (targetMembership.role === "owner" && input.role !== "owner") {
      const ownerCount = memberships.filter(
        (membership) => membership.role === "owner",
      ).length;

      if (ownerCount === 1) {
        return {
          ok: false,
          reason: "last_owner",
        };
      }
    }

    if (targetMembership.role === input.role) {
      return {
        ok: true,
        membership: {
          id: targetMembership.id,
          role: targetMembership.role,
        },
      };
    }

    await trx
      .updateTable("membership")
      .set({
        role: input.role,
        updated_at: new Date(),
      })
      .where("id", "=", targetMembership.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      membership: {
        id: targetMembership.id,
        role: input.role,
      },
    };
  });
}
