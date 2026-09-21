import { db } from "../../../db.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "./write-policy.js";

type RevokeOrganizationInvitationInput = {
  userId: string;
  organizationId: string;
  invitationId: string;
};

type RevokeOrganizationInvitationFailure =
  | "organization_not_found"
  | "invitation_not_found"
  | "insufficient_role"
  | "invitation_already_accepted"
  | "invitation_already_revoked"
  | OrganizationWriteStateFailure;

export type RevokeOrganizationInvitationResult =
  | {
      ok: true;
      invitation: {
        id: string;
        revokedAt: string;
      };
    }
  | {
      ok: false;
      reason: RevokeOrganizationInvitationFailure;
    };

export async function revokeOrganizationInvitation(
  input: RevokeOrganizationInvitationInput,
): Promise<RevokeOrganizationInvitationResult> {
  return db.transaction().execute(async (trx) => {
    // Keep authorization stable while the invitation is being revoked.
    const membership = await trx
      .selectFrom("membership")
      .select("role")
      .where("user_id", "=", input.userId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!membership) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );

    if (!writeState.ok) {
      return writeState;
    }

    // Lock the invitation after the organization so invitation writes share
    // the same organization -> invitation lock order.
    const invitation = await trx
      .selectFrom("organization_invitation")
      .select(["id", "role", "accepted_at", "revoked_at"])
      .where("id", "=", input.invitationId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!invitation) {
      return {
        ok: false,
        reason: "invitation_not_found",
      };
    }

    const canRevoke =
      membership.role === "owner" ||
      (membership.role === "manager" && invitation.role === "staff");

    if (!canRevoke) {
      return {
        ok: false,
        reason: "insufficient_role",
      };
    }

    if (invitation.accepted_at) {
      return {
        ok: false,
        reason: "invitation_already_accepted",
      };
    }

    if (invitation.revoked_at) {
      return {
        ok: false,
        reason: "invitation_already_revoked",
      };
    }

    const revokedAt = new Date();

    await trx
      .updateTable("organization_invitation")
      .set({
        revoked_at: revokedAt,
      })
      .where("id", "=", invitation.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      invitation: {
        id: invitation.id,
        revokedAt: revokedAt.toISOString(),
      },
    };
  });
}
