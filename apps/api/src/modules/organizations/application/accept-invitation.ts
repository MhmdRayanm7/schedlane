import { createHash } from "node:crypto";
import { db } from "../../../db.js";
import type { MembershipRole } from "../../../db-types.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "./write-policy.js";

type AcceptOrganizationInvitationInput = {
  userId: string;
  userEmail: string;
  token: string;
};

type AcceptOrganizationInvitationFailure =
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

export type AcceptOrganizationInvitationResult =
  | {
      ok: true;
      organizationId: string;
      role: MembershipRole;
      resourceId: string | null;
      acceptedAt: string;
    }
  | {
      ok: false;
      reason: AcceptOrganizationInvitationFailure;
    };

export async function acceptOrganizationInvitation(
  input: AcceptOrganizationInvitationInput,
): Promise<AcceptOrganizationInvitationResult> {
  const email = input.userEmail.trim().toLowerCase();

  // Hash the presented secret exactly as we did when the invitation was created.
  const tokenHash = createHash("sha256").update(input.token).digest("hex");

  return db.transaction().execute(async (trx) => {
    // Resolve lock dependencies first without locking the invitation itself.
    const invitationReference = await trx
      .selectFrom("organization_invitation")
      .select(["organization_id", "resource_id"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();

    if (!invitationReference) {
      return {
        ok: false,
        reason: "invitation_not_found",
      };
    }

    const writeState = await requireWritableOrganization(
      trx,
      invitationReference.organization_id,
    );

    if (!writeState.ok) {
      return writeState;
    }

    const targetResource = invitationReference.resource_id
      ? await trx
          .selectFrom("resource")
          .select(["id", "user_id", "deactivated_at"])
          .where("id", "=", invitationReference.resource_id)
          .where("organization_id", "=", invitationReference.organization_id)
          .forUpdate()
          .executeTakeFirst()
      : undefined;

    // Acceptance and revocation compete for the same invitation state.
    const invitation = await trx
      .selectFrom("organization_invitation")
      .select([
        "id",
        "organization_id",
        "email",
        "role",
        "resource_id",
        "expires_at",
        "accepted_at",
        "revoked_at",
      ])
      .where("token_hash", "=", tokenHash)
      .where("organization_id", "=", invitationReference.organization_id)
      .forUpdate()
      .executeTakeFirst();

    if (!invitation) {
      return {
        ok: false,
        reason: "invitation_not_found",
      };
    }

    // Evaluate time-dependent state only after acquiring the invitation lock.
    const now = new Date();

    if (invitation.revoked_at) {
      return {
        ok: false,
        reason: "invitation_revoked",
      };
    }

    if (invitation.accepted_at) {
      return {
        ok: false,
        reason: "invitation_already_accepted",
      };
    }

    if (invitation.expires_at <= now) {
      return {
        ok: false,
        reason: "invitation_expired",
      };
    }

    // An invitation can only be accepted by the verified account it was sent to.
    if (invitation.email !== email) {
      return {
        ok: false,
        reason: "email_mismatch",
      };
    }

    const staffResourceId =
      invitation.role === "staff" ? invitation.resource_id : null;

    if (invitation.role === "staff") {
      // Legacy Staff invitations created before Resource targeting cannot be accepted.
      if (!staffResourceId || !targetResource) {
        return {
          ok: false,
          reason: "resource_not_found",
        };
      }

      if (targetResource.deactivated_at) {
        return {
          ok: false,
          reason: "resource_deactivated",
        };
      }

      if (targetResource.user_id) {
        return {
          ok: false,
          reason: "resource_already_linked",
        };
      }

      const existingLinkedResource = await trx
        .selectFrom("resource")
        .select("id")
        .where("organization_id", "=", invitation.organization_id)
        .where("user_id", "=", input.userId)
        .executeTakeFirst();

      if (existingLinkedResource) {
        return {
          ok: false,
          reason: "user_resource_already_linked",
        };
      }
    }

    const existingMembership = await trx
      .selectFrom("membership")
      .select("id")
      .where("organization_id", "=", invitation.organization_id)
      .where("user_id", "=", input.userId)
      .executeTakeFirst();

    if (existingMembership) {
      // The invitation is no longer needed once this user already belongs to the organization.
      await trx
        .updateTable("organization_invitation")
        .set({
          revoked_at: now,
        })
        .where("id", "=", invitation.id)
        .executeTakeFirstOrThrow();

      return {
        ok: false,
        reason: "already_member",
      };
    }

    const membership = await trx
      .insertInto("membership")
      .values({
        organization_id: invitation.organization_id,
        user_id: input.userId,
        role: invitation.role,
      })
      .onConflict((oc) =>
        oc.columns(["organization_id", "user_id"]).doNothing(),
      )
      .returning("id")
      .executeTakeFirst();

    if (!membership) {
      // A concurrent membership makes the invitation unnecessary.
      await trx
        .updateTable("organization_invitation")
        .set({
          revoked_at: now,
        })
        .where("id", "=", invitation.id)
        .executeTakeFirstOrThrow();

      return {
        ok: false,
        reason: "already_member",
      };
    }

    if (staffResourceId) {
      // Membership and Resource linkage commit atomically with invitation acceptance.
      await trx
        .updateTable("resource")
        .set({
          user_id: input.userId,
          updated_at: now,
        })
        .where("id", "=", staffResourceId)
        .where("user_id", "is", null)
        .executeTakeFirstOrThrow();
    }

    await trx
      .updateTable("organization_invitation")
      .set({
        accepted_by_user_id: input.userId,
        accepted_at: now,
      })
      .where("id", "=", invitation.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      organizationId: invitation.organization_id,
      role: invitation.role,
      resourceId: staffResourceId,
      acceptedAt: now.toISOString(),
    };
  });
}
