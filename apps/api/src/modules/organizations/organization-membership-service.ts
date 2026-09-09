import type { Transaction } from "kysely";
import { db } from "../../db.js";
import type { Database, MembershipRole } from "../../db-types.js";
import { lockOrganizationMemberships } from "./organization-membership-lock.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "./organization-write-policy.js";

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
  | "last_owner"
  | OrganizationWriteStateFailure;

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

type RemoveOrganizationMemberInput = {
  userId: string;
  organizationId: string;
  membershipId: string;
};

type RemoveOrganizationMemberFailure =
  | "organization_not_found"
  | "member_not_found"
  | "insufficient_role"
  | "self_removal_requires_leave"
  | OrganizationWriteStateFailure;

export type RemoveOrganizationMemberResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: RemoveOrganizationMemberFailure;
    };

type LeaveOrganizationInput = {
  userId: string;
  organizationId: string;
};

type LeaveOrganizationFailure =
  | "organization_not_found"
  | "last_owner"
  | OrganizationWriteStateFailure;

export type LeaveOrganizationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: LeaveOrganizationFailure;
    };

async function unlinkUserResource(
  trx: Transaction<Database>,
  organizationId: string,
  userId: string,
  updatedAt: Date,
): Promise<void> {
  // Membership removal detaches the account but preserves the Resource and its history.
  await trx
    .updateTable("resource")
    .set({
      user_id: null,
      updated_at: updatedAt,
    })
    .where("organization_id", "=", organizationId)
    .where("user_id", "=", userId)
    .execute();
}

export async function updateOrganizationMemberRole(
  input: UpdateOrganizationMemberRoleInput,
): Promise<UpdateOrganizationMemberRoleResult> {
  return db.transaction().execute(async (trx) => {
    // Membership management is serialized per organization to protect cross-row invariants.
    const memberships = await lockOrganizationMemberships(
      trx,
      input.organizationId,
    );

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

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );

    if (!writeState.ok) {
      return writeState;
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

export async function removeOrganizationMember(
  input: RemoveOrganizationMemberInput,
): Promise<RemoveOrganizationMemberResult> {
  return db.transaction().execute(async (trx) => {
    // Serialize membership management changes within the organization.
    const memberships = await lockOrganizationMemberships(
      trx,
      input.organizationId,
    );

    const actorMembership = memberships.find(
      (membership) => membership.user_id === input.userId,
    );

    if (!actorMembership) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    // Staff cannot manage other organization memberships.
    if (actorMembership.role === "staff") {
      return {
        ok: false,
        reason: "insufficient_role",
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

    if (targetMembership.user_id === input.userId) {
      return {
        ok: false,
        reason: "self_removal_requires_leave",
      };
    }

    const canRemove =
      actorMembership.role === "owner" ||
      (actorMembership.role === "manager" && targetMembership.role === "staff");

    if (!canRemove) {
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

    const now = new Date();

    await unlinkUserResource(
      trx,
      input.organizationId,
      targetMembership.user_id,
      now,
    );

    await trx
      .deleteFrom("membership")
      .where("id", "=", targetMembership.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
    };
  });
}

export async function leaveOrganization(
  input: LeaveOrganizationInput,
): Promise<LeaveOrganizationResult> {
  return db.transaction().execute(async (trx) => {
    // Self-leave also locks the membership set to preserve the last-owner invariant.
    const memberships = await lockOrganizationMemberships(
      trx,
      input.organizationId,
    );

    const membership = memberships.find(
      (item) => item.user_id === input.userId,
    );

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

    if (membership.role === "owner") {
      const ownerCount = memberships.filter(
        (item) => item.role === "owner",
      ).length;

      if (ownerCount === 1) {
        return {
          ok: false,
          reason: "last_owner",
        };
      }
    }

    const now = new Date();

    await unlinkUserResource(
      trx,
      input.organizationId,
      membership.user_id,
      now,
    );

    await trx
      .deleteFrom("membership")
      .where("id", "=", membership.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
    };
  });
}
