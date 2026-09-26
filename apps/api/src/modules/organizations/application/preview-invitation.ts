import { createHash } from "node:crypto";
import { db } from "../../../db.js";
import type { MembershipRole } from "../../../db-types.js";
import type { OrganizationWriteStateFailure } from "./write-policy.js";

type PreviewOrganizationInvitationInput = {
  userId: string;
  userEmail: string;
  token: string;
};

type PreviewOrganizationInvitationFailure =
  | "invitation_not_found"
  | "invitation_revoked"
  | "invitation_expired"
  | "invitation_already_accepted"
  | "email_mismatch"
  | "already_member"
  | "resource_not_found"
  | "resource_deactivated"
  | "resource_already_linked"
  | "user_resource_already_linked"
  | OrganizationWriteStateFailure;

export type PreviewOrganizationInvitationResult =
  | {
      ok: true;
      invitation: {
        organizationId: string;
        organizationName: string;
        role: MembershipRole;
        resource: {
          id: string;
          name: string;
        } | null;
        invitedByName: string;
        expiresAt: string;
      };
    }
  | {
      ok: false;
      reason: PreviewOrganizationInvitationFailure;
    };

export async function previewOrganizationInvitation(
  input: PreviewOrganizationInvitationInput,
): Promise<PreviewOrganizationInvitationResult> {
  const email = input.userEmail.trim().toLowerCase();
  const tokenHash = createHash("sha256").update(input.token).digest("hex");

  const row = await db
    .selectFrom("organization_invitation")
    .innerJoin(
      "organization",
      "organization.id",
      "organization_invitation.organization_id",
    )
    .innerJoin(
      "user as inviter",
      "inviter.id",
      "organization_invitation.invited_by_user_id",
    )
    .leftJoin(
      "resource",
      "resource.id",
      "organization_invitation.resource_id",
    )
    .select([
      "organization_invitation.id",
      "organization_invitation.organization_id",
      "organization_invitation.email",
      "organization_invitation.role",
      "organization_invitation.resource_id",
      "organization_invitation.expires_at",
      "organization_invitation.accepted_at",
      "organization_invitation.revoked_at",
      "organization.name as organization_name",
      "organization.archived_at",
      "organization.suspended_at",
      "inviter.name as invited_by_name",
      "resource.id as target_resource_id",
      "resource.name as target_resource_name",
      "resource.deactivated_at as target_resource_deactivated_at",
      "resource.user_id as target_resource_user_id",
    ])
    .where("organization_invitation.token_hash", "=", tokenHash)
    .executeTakeFirst();

  if (!row) {
    return {
      ok: false,
      reason: "invitation_not_found",
    };
  }

  if (row.suspended_at) {
    return {
      ok: false,
      reason: "organization_suspended",
    };
  }

  if (row.archived_at) {
    return {
      ok: false,
      reason: "organization_archived",
    };
  }

  if (row.revoked_at) {
    return {
      ok: false,
      reason: "invitation_revoked",
    };
  }

  if (row.accepted_at) {
    return {
      ok: false,
      reason: "invitation_already_accepted",
    };
  }

  const now = new Date();
  if (row.expires_at <= now) {
    return {
      ok: false,
      reason: "invitation_expired",
    };
  }

  if (row.email !== email) {
    return {
      ok: false,
      reason: "email_mismatch",
    };
  }

  const existingMembership = await db
    .selectFrom("membership")
    .select("id")
    .where("organization_id", "=", row.organization_id)
    .where("user_id", "=", input.userId)
    .executeTakeFirst();

  if (existingMembership) {
    return {
      ok: false,
      reason: "already_member",
    };
  }

  if (row.role === "staff") {
    if (
      !row.resource_id ||
      !row.target_resource_id ||
      !row.target_resource_name
    ) {
      return {
        ok: false,
        reason: "resource_not_found",
      };
    }

    if (row.target_resource_deactivated_at) {
      return {
        ok: false,
        reason: "resource_deactivated",
      };
    }

    if (row.target_resource_user_id) {
      return {
        ok: false,
        reason: "resource_already_linked",
      };
    }

    const existingLinkedResource = await db
      .selectFrom("resource")
      .select("id")
      .where("organization_id", "=", row.organization_id)
      .where("user_id", "=", input.userId)
      .executeTakeFirst();

    if (existingLinkedResource) {
      return {
        ok: false,
        reason: "user_resource_already_linked",
      };
    }
  }

  return {
    ok: true,
    invitation: {
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      role: row.role,
      resource:
        row.target_resource_id && row.target_resource_name
          ? {
              id: row.target_resource_id,
              name: row.target_resource_name,
            }
          : null,
      invitedByName: row.invited_by_name,
      expiresAt: row.expires_at.toISOString(),
    },
  };
}
