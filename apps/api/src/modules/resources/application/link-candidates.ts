import { db } from "../../../db.js";
import type { MembershipRole } from "../../../db-types.js";

type GetResourceLinkCandidatesInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
};

export type ResourceLinkCandidates = {
  currentLink: {
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: MembershipRole;
    canManage: boolean;
  } | null;
  pendingInvitation: {
    id: string;
    email: string;
    expiresAt: string;
  } | null;
  candidates: Array<{
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: MembershipRole;
  }>;
};

type GetResourceLinkCandidatesFailure =
  | "organization_not_found"
  | "insufficient_role"
  | "resource_not_found"
  | "resource_deactivated";

export type GetResourceLinkCandidatesResult =
  | {
      ok: true;
      data: ResourceLinkCandidates;
    }
  | {
      ok: false;
      reason: GetResourceLinkCandidatesFailure;
    };

export async function getResourceLinkCandidates(
  input: GetResourceLinkCandidatesInput,
): Promise<GetResourceLinkCandidatesResult> {
  // Preserve anti-leak ordering: verify viewer membership first
  const actorMembership = await db
    .selectFrom("membership")
    .select("role")
    .where("organization_id", "=", input.organizationId)
    .where("user_id", "=", input.userId)
    .executeTakeFirst();

  if (!actorMembership) {
    return { ok: false, reason: "organization_not_found" };
  }

  if (actorMembership.role === "staff") {
    return { ok: false, reason: "insufficient_role" };
  }

  const resource = await db
    .selectFrom("resource")
    .select(["id", "name", "user_id", "deactivated_at"])
    .where("id", "=", input.resourceId)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirst();

  if (!resource) {
    return { ok: false, reason: "resource_not_found" };
  }

  if (resource.deactivated_at) {
    return { ok: false, reason: "resource_deactivated" };
  }

  // Active pending invitation check
  const now = new Date();
  const invitation = await db
    .selectFrom("organization_invitation")
    .select(["id", "email", "expires_at"])
    .where("organization_id", "=", input.organizationId)
    .where("resource_id", "=", resource.id)
    .where("accepted_at", "is", null)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", now)
    .executeTakeFirst();

  const pendingInvitation = invitation
    ? {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expires_at.toISOString(),
      }
    : null;

  // Current link check
  let currentLink: ResourceLinkCandidates["currentLink"] = null;
  if (resource.user_id) {
    const linkedRow = await db
      .selectFrom("membership")
      .innerJoin("user", "user.id", "membership.user_id")
      .select([
        "membership.id as membership_id",
        "membership.role",
        "user.id as user_id",
        "user.name",
        "user.email",
      ])
      .where("membership.organization_id", "=", input.organizationId)
      .where("membership.user_id", "=", resource.user_id)
      .executeTakeFirst();

    if (linkedRow) {
      const canManage =
        actorMembership.role === "owner" || linkedRow.role === "staff";
      currentLink = {
        membershipId: linkedRow.membership_id,
        userId: linkedRow.user_id,
        name: linkedRow.name,
        email: linkedRow.email,
        role: linkedRow.role,
        canManage,
      };
    }
  }

  // Find eligible candidate members
  let query = db
    .selectFrom("membership")
    .innerJoin("user", "user.id", "membership.user_id")
    .select([
      "membership.id as membership_id",
      "membership.role",
      "user.id as user_id",
      "user.name",
      "user.email",
    ])
    .where("membership.organization_id", "=", input.organizationId)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("resource")
            .select("resource.id")
            .whereRef(
              "resource.organization_id",
              "=",
              "membership.organization_id",
            )
            .whereRef("resource.user_id", "=", "membership.user_id")
            .where("resource.id", "!=", input.resourceId),
        ),
      ),
    );

  if (resource.user_id) {
    query = query.where("membership.user_id", "!=", resource.user_id);
  }

  if (actorMembership.role === "manager") {
    query = query.where("membership.role", "=", "staff");
  }

  const candidateRows = await query
    .orderBy("user.name", "asc")
    .orderBy("user.email", "asc")
    .execute();

  const candidates = candidateRows.map((row) => ({
    membershipId: row.membership_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
  }));

  return {
    ok: true,
    data: {
      currentLink,
      pendingInvitation,
      candidates,
    },
  };
}
