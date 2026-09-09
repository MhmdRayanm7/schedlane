import { db } from "../../db.js";
import { lockOrganizationMemberships } from "../organizations/organization-membership-lock.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../organizations/organization-write-policy.js";

type CreateResourceInput = {
  userId: string;
  organizationId: string;
  name: string;
};

type CreateResourceFailure =
  | "organization_not_found"
  | "insufficient_role"
  | OrganizationWriteStateFailure;

export type CreateResourceResult =
  | {
      ok: true;
      resource: {
        id: string;
        name: string;
        deactivatedAt: null;
        createdAt: string;
      };
    }
  | {
      ok: false;
      reason: CreateResourceFailure;
    };

type LinkResourceToMemberInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
  membershipId: string;
};

type LinkResourceToMemberFailure =
  | "organization_not_found"
  | "member_not_found"
  | "resource_not_found"
  | "insufficient_role"
  | "resource_deactivated"
  | "resource_already_linked"
  | "member_resource_already_linked"
  | "resource_invitation_pending"
  | OrganizationWriteStateFailure;

export type LinkResourceToMemberResult =
  | {
      ok: true;
      resource: {
        id: string;
        linkedMembershipId: string;
      };
    }
  | {
      ok: false;
      reason: LinkResourceToMemberFailure;
    };

type UnlinkResourceInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
};

type UnlinkResourceFailure =
  | "organization_not_found"
  | "resource_not_found"
  | "insufficient_role"
  | OrganizationWriteStateFailure;

export type UnlinkResourceResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: UnlinkResourceFailure;
    };

type DeactivateResourceInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
};

type DeactivateResourceFailure =
  | "organization_not_found"
  | "resource_not_found"
  | "insufficient_role"
  | OrganizationWriteStateFailure;

export type DeactivateResourceResult =
  | {
      ok: true;
      resource: {
        id: string;
        deactivatedAt: string;
      };
    }
  | {
      ok: false;
      reason: DeactivateResourceFailure;
    };

type ReactivateResourceInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
};

type ReactivateResourceFailure =
  | "organization_not_found"
  | "resource_not_found"
  | "insufficient_role"
  | OrganizationWriteStateFailure;

export type ReactivateResourceResult =
  | {
      ok: true;
      resource: {
        id: string;
        deactivatedAt: null;
      };
    }
  | {
      ok: false;
      reason: ReactivateResourceFailure;
    };

export async function createResource(
  input: CreateResourceInput,
): Promise<CreateResourceResult> {
  return db.transaction().execute(async (trx) => {
    // Keep authorization stable while the organization resource is created.
    const membership = await trx
      .selectFrom("membership")
      .select("role")
      .where("organization_id", "=", input.organizationId)
      .where("user_id", "=", input.userId)
      .forUpdate()
      .executeTakeFirst();

    if (!membership) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    // Resource management is an owner/manager operation.
    if (membership.role === "staff") {
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

    const resource = await trx
      .insertInto("resource")
      .values({
        organization_id: input.organizationId,
        user_id: null,
        name: input.name.trim(),
        deactivated_at: null,
      })
      .returning(["id", "name", "deactivated_at", "created_at"])
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      resource: {
        id: resource.id,
        name: resource.name,
        deactivatedAt: null,
        createdAt: resource.created_at.toISOString(),
      },
    };
  });
}

export async function linkResourceToMember(
  input: LinkResourceToMemberInput,
): Promise<LinkResourceToMemberResult> {
  return db.transaction().execute(async (trx) => {
    // Serialize membership-dependent Resource changes within the organization.
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

    // Managers may manage Staff Resources but not Owner/Manager relationships.
    if (
      actorMembership.role === "manager" &&
      targetMembership.role !== "staff"
    ) {
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

    const resource = await trx
      .selectFrom("resource")
      .select(["id", "user_id", "deactivated_at"])
      .where("id", "=", input.resourceId)
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

    // PUT is idempotent when the Resource already has the requested link.
    if (resource.user_id === targetMembership.user_id) {
      return {
        ok: true,
        resource: {
          id: resource.id,
          linkedMembershipId: targetMembership.id,
        },
      };
    }

    if (resource.user_id) {
      return {
        ok: false,
        reason: "resource_already_linked",
      };
    }

    const existingLinkedResource = await trx
      .selectFrom("resource")
      .select("id")
      .where("organization_id", "=", input.organizationId)
      .where("user_id", "=", targetMembership.user_id)
      .executeTakeFirst();

    if (existingLinkedResource) {
      return {
        ok: false,
        reason: "member_resource_already_linked",
      };
    }

    const now = new Date();

    const pendingInvitation = await trx
      .selectFrom("organization_invitation")
      .select(["id", "expires_at"])
      .where("resource_id", "=", resource.id)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .forUpdate()
      .executeTakeFirst();

    if (pendingInvitation) {
      if (pendingInvitation.expires_at > now) {
        return {
          ok: false,
          reason: "resource_invitation_pending",
        };
      }

      // Expired invitations must not reserve a Resource indefinitely.
      await trx
        .updateTable("organization_invitation")
        .set({
          revoked_at: now,
        })
        .where("id", "=", pendingInvitation.id)
        .executeTakeFirstOrThrow();
    }

    await trx
      .updateTable("resource")
      .set({
        user_id: targetMembership.user_id,
        updated_at: now,
      })
      .where("id", "=", resource.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      resource: {
        id: resource.id,
        linkedMembershipId: targetMembership.id,
      },
    };
  });
}

export async function unlinkResource(
  input: UnlinkResourceInput,
): Promise<UnlinkResourceResult> {
  return db.transaction().execute(async (trx) => {
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

    if (actorMembership.role === "staff") {
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

    const resource = await trx
      .selectFrom("resource")
      .select(["id", "user_id"])
      .where("id", "=", input.resourceId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!resource) {
      return {
        ok: false,
        reason: "resource_not_found",
      };
    }

    // DELETE remains idempotent when the Resource is already unlinked.
    if (!resource.user_id) {
      return {
        ok: true,
      };
    }

    const linkedMembership = memberships.find(
      (membership) => membership.user_id === resource.user_id,
    );

    if (
      actorMembership.role === "manager" &&
      linkedMembership?.role !== "staff"
    ) {
      return {
        ok: false,
        reason: "insufficient_role",
      };
    }

    await trx
      .updateTable("resource")
      .set({
        user_id: null,
        updated_at: new Date(),
      })
      .where("id", "=", resource.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
    };
  });
}

export async function deactivateResource(
  input: DeactivateResourceInput,
): Promise<DeactivateResourceResult> {
  return db.transaction().execute(async (trx) => {
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

    if (actorMembership.role === "staff") {
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

    const resource = await trx
      .selectFrom("resource")
      .select(["id", "user_id", "deactivated_at"])
      .where("id", "=", input.resourceId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!resource) {
      return {
        ok: false,
        reason: "resource_not_found",
      };
    }

    const linkedMembership = resource.user_id
      ? memberships.find(
          (membership) => membership.user_id === resource.user_id,
        )
      : undefined;

    if (
      actorMembership.role === "manager" &&
      resource.user_id &&
      linkedMembership?.role !== "staff"
    ) {
      return {
        ok: false,
        reason: "insufficient_role",
      };
    }

    if (resource.deactivated_at) {
      return {
        ok: true,
        resource: {
          id: resource.id,
          deactivatedAt: resource.deactivated_at.toISOString(),
        },
      };
    }

    const deactivatedAt = new Date();

    await trx
      .updateTable("resource")
      .set({
        deactivated_at: deactivatedAt,
        updated_at: deactivatedAt,
      })
      .where("id", "=", resource.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      resource: {
        id: resource.id,
        deactivatedAt: deactivatedAt.toISOString(),
      },
    };
  });
}

export async function reactivateResource(
  input: ReactivateResourceInput,
): Promise<ReactivateResourceResult> {
  return db.transaction().execute(async (trx) => {
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

    if (actorMembership.role === "staff") {
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

    const resource = await trx
      .selectFrom("resource")
      .select(["id", "user_id", "deactivated_at"])
      .where("id", "=", input.resourceId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!resource) {
      return {
        ok: false,
        reason: "resource_not_found",
      };
    }

    const linkedMembership = resource.user_id
      ? memberships.find(
          (membership) => membership.user_id === resource.user_id,
        )
      : undefined;

    if (
      actorMembership.role === "manager" &&
      resource.user_id &&
      linkedMembership?.role !== "staff"
    ) {
      return {
        ok: false,
        reason: "insufficient_role",
      };
    }

    if (!resource.deactivated_at) {
      return {
        ok: true,
        resource: {
          id: resource.id,
          deactivatedAt: null,
        },
      };
    }

    const updatedAt = new Date();

    await trx
      .updateTable("resource")
      .set({
        deactivated_at: null,
        updated_at: updatedAt,
      })
      .where("id", "=", resource.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      resource: {
        id: resource.id,
        deactivatedAt: null,
      },
    };
  });
}
