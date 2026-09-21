import { createHash, randomBytes } from "node:crypto";
import { sql } from "kysely";
import { db } from "../../../db.js";
import type { MembershipRole } from "../../../db-types.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "./write-policy.js";

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
