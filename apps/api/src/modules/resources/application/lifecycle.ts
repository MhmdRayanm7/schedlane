import { db } from "../../../db.js";
import { lockOrganizationMemberships } from "../../organizations/application/membership-lock.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";

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
