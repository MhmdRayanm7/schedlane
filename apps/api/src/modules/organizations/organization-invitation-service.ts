import { createHash, randomBytes } from "node:crypto";
import { sql } from "kysely";
import { db } from "../../db.js";
import type { MembershipRole } from "../../db-types.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "./organization-write-policy.js";

const INVITATION_TTL_DAYS = 7;

type CreateOrganizationInvitationInput = {
  invitedByUserId: string;
  organizationId: string;
  email: string;
  role: MembershipRole;
  resourceId?: string;
};

type CreateOrganizationInvitationFailure =
  | "organization_not_found"
  | "insufficient_role"
  | "already_member"
  | "invitation_already_pending"
  | "resource_required"
  | "resource_not_allowed"
  | "resource_not_found"
  | "resource_deactivated"
  | "resource_already_linked"
  | "resource_invitation_already_pending"
  | OrganizationWriteStateFailure;

export type CreateOrganizationInvitationResult =
  | {
      ok: true;
      invitation: {
        id: string;
        email: string;
        role: MembershipRole;
        resourceId: string | null;
        expiresAt: string;
      };
      token: string;
    }
  | {
      ok: false;
      reason: CreateOrganizationInvitationFailure;
    };

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

export async function createOrganizationInvitation(
  input: CreateOrganizationInvitationInput,
): Promise<CreateOrganizationInvitationResult> {
  const email = input.email.trim().toLowerCase();

  if (input.role === "staff" && !input.resourceId) {
    return {
      ok: false,
      reason: "resource_required",
    };
  }

  if (input.role !== "staff" && input.resourceId !== undefined) {
    return {
      ok: false,
      reason: "resource_not_allowed",
    };
  }

  const resourceId = input.resourceId ?? null;

  return db.transaction().execute(async (trx) => {
    // Lock the inviter's membership while its role is used for authorization.
    const inviterMembership = await trx
      .selectFrom("membership")
      .select("role")
      .where("user_id", "=", input.invitedByUserId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!inviterMembership) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    const canInvite =
      inviterMembership.role === "owner" ||
      (inviterMembership.role === "manager" && input.role === "staff");

    if (!canInvite) {
      return {
        ok: false,
        reason: "insufficient_role",
      };
    }

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );

    if (!writeState.ok) {
      return writeState;
    }

    // Resource-backed Staff invitations share the organization -> resource
    // -> invitation lock order with invitation acceptance.
    if (resourceId) {
      const resource = await trx
        .selectFrom("resource")
        .select(["id", "user_id", "deactivated_at"])
        .where("id", "=", resourceId)
        .where("organization_id", "=", input.organizationId)
        .forUpdate()
        .executeTakeFirst();

      if (!resource) {
        return {
          ok: false,
          reason: "resource_not_found",
        };
      }

      if (resource.deactivated_at) {
        return {
          ok: false,
          reason: "resource_deactivated",
        };
      }

      if (resource.user_id) {
        return {
          ok: false,
          reason: "resource_already_linked",
        };
      }
    }

    const now = new Date();

    const existingMember = await trx
      .selectFrom("membership")
      .innerJoin("user", "user.id", "membership.user_id")
      .select("membership.id")
      .where("membership.organization_id", "=", input.organizationId)
      .where(sql<string>`lower(${sql.ref("user.email")})`, "=", email)
      .executeTakeFirst();

    if (existingMember) {
      return {
        ok: false,
        reason: "already_member",
      };
    }

    const existingInvitation = await trx
      .selectFrom("organization_invitation")
      .select(["id", "expires_at"])
      .where("organization_id", "=", input.organizationId)
      .where("email", "=", email)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .forUpdate()
      .executeTakeFirst();

    if (existingInvitation) {
      if (existingInvitation.expires_at > now) {
        return {
          ok: false,
          reason: "invitation_already_pending",
        };
      }

      // Close expired invitations before issuing a replacement token.
      await trx
        .updateTable("organization_invitation")
        .set({
          revoked_at: now,
        })
        .where("id", "=", existingInvitation.id)
        .executeTakeFirstOrThrow();
    }

    if (resourceId) {
      const existingResourceInvitation = await trx
        .selectFrom("organization_invitation")
        .select(["id", "expires_at"])
        .where("resource_id", "=", resourceId)
        .where("accepted_at", "is", null)
        .where("revoked_at", "is", null)
        .forUpdate()
        .executeTakeFirst();

      if (existingResourceInvitation) {
        if (existingResourceInvitation.expires_at > now) {
          return {
            ok: false,
            reason: "resource_invitation_already_pending",
          };
        }

        // Expired invitations must not keep a Resource reserved indefinitely.
        await trx
          .updateTable("organization_invitation")
          .set({
            revoked_at: now,
          })
          .where("id", "=", existingResourceInvitation.id)
          .executeTakeFirstOrThrow();
      }
    }

    const token = randomBytes(32).toString("base64url");

    // Only the token hash is persisted so a database leak cannot expose usable invite links.
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const expiresAt = new Date(
      now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const invitation = await trx
      .insertInto("organization_invitation")
      .values({
        organization_id: input.organizationId,
        invited_by_user_id: input.invitedByUserId,
        email,
        role: input.role,
        resource_id: resourceId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        accepted_by_user_id: null,
        accepted_at: null,
        revoked_at: null,
      })
      // Database uniqueness remains the final guard for concurrent invitation creation.
      .onConflict((oc) => oc.doNothing())
      .returning(["id", "email", "role", "resource_id", "expires_at"])
      .executeTakeFirst();

    if (!invitation) {
      if (resourceId) {
        const conflictingResourceInvitation = await trx
          .selectFrom("organization_invitation")
          .select("id")
          .where("resource_id", "=", resourceId)
          .where("accepted_at", "is", null)
          .where("revoked_at", "is", null)
          .executeTakeFirst();

        if (conflictingResourceInvitation) {
          return {
            ok: false,
            reason: "resource_invitation_already_pending",
          };
        }
      }

      return {
        ok: false,
        reason: "invitation_already_pending",
      };
    }

    return {
      ok: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        resourceId: invitation.resource_id,
        expiresAt: invitation.expires_at.toISOString(),
      },
      token,
    };
  });
}

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

export async function revokeInvitationAfterDeliveryFailure(
  invitationId: string,
): Promise<void> {
  // Failed delivery must not leave behind an active invitation with an undisclosed token.
  await db
    .updateTable("organization_invitation")
    .set({
      revoked_at: new Date(),
    })
    .where("id", "=", invitationId)
    .where("accepted_at", "is", null)
    .where("revoked_at", "is", null)
    .execute();
}
