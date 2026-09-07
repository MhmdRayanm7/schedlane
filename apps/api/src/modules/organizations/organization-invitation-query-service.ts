import { db } from "../../db.js";
import type { MembershipRole } from "../../db-types.js";

type ListOrganizationInvitationsInput = {
  userId: string;
  organizationId: string;
};

type OrganizationInvitationStatus = "pending" | "expired";

type OrganizationInvitationListItem = {
  id: string;
  email: string;
  role: MembershipRole;
  resourceId: string | null;
  status: OrganizationInvitationStatus;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
};

type ListOrganizationInvitationsFailure =
  | "organization_not_found"
  | "insufficient_role";

export type ListOrganizationInvitationsResult =
  | {
      ok: true;
      items: OrganizationInvitationListItem[];
    }
  | {
      ok: false;
      reason: ListOrganizationInvitationsFailure;
    };

export async function listOrganizationInvitations(
  input: ListOrganizationInvitationsInput,
): Promise<ListOrganizationInvitationsResult> {
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

  if (membership.role === "staff") {
    return {
      ok: false,
      reason: "insufficient_role",
    };
  }

  let query = db
    .selectFrom("organization_invitation")
    .innerJoin(
      "user as inviter",
      "inviter.id",
      "organization_invitation.invited_by_user_id",
    )
    .select([
      "organization_invitation.id",
      "organization_invitation.email",
      "organization_invitation.role",
      "organization_invitation.resource_id",
      "organization_invitation.expires_at",
      "organization_invitation.created_at",
      "inviter.name as invited_by_name",
    ])
    .where("organization_invitation.organization_id", "=", input.organizationId)
    .where("organization_invitation.accepted_at", "is", null)
    .where("organization_invitation.revoked_at", "is", null);

  // Managers may manage Staff invitations but not higher organization roles.
  if (membership.role === "manager") {
    query = query.where("organization_invitation.role", "=", "staff");
  }

  const rows = await query
    .orderBy("organization_invitation.created_at", "desc")
    .execute();

  const now = new Date();

  return {
    ok: true,
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      resourceId: row.resource_id,
      status: row.expires_at <= now ? "expired" : "pending",
      invitedByName: row.invited_by_name,
      expiresAt: row.expires_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    })),
  };
}
