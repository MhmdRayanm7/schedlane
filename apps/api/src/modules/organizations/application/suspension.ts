import type { Transaction } from "kysely";
import { db } from "../../../db.js";
import type { Database } from "../../../db-types.js";
import { insertOutboxEventInTransaction } from "../../../outbox/persistence.js";
import {
  type OrganizationSuspendedPayload,
  type OrganizationUnsuspendedPayload,
  organizationLifecycleEventTypes,
} from "../domain/lifecycle-events.js";

type SuspendOrganizationInput = {
  userId: string;
  organizationId: string;
  reason: string;
};

type SuspendOrganizationFailure =
  | "platform_admin_required"
  | "organization_not_found"
  | "already_suspended"
  | "invalid_reason";

export type SuspendOrganizationResult =
  | {
      ok: true;
      organization: {
        id: string;
        suspendedAt: string;
      };
    }
  | {
      ok: false;
      reason: SuspendOrganizationFailure;
    };

type UnsuspendOrganizationInput = {
  userId: string;
  organizationId: string;
  internalNote?: string | undefined;
};

async function primaryOwner(
  trx: Transaction<Database>,
  organizationId: string,
) {
  return trx
    .selectFrom("membership")
    .innerJoin("user", "user.id", "membership.user_id")
    .select(["user.name", "user.email"])
    .where("membership.organization_id", "=", organizationId)
    .where("membership.role", "=", "owner")
    .orderBy("membership.created_at", "asc")
    .orderBy("membership.id", "asc")
    .executeTakeFirst();
}

type UnsuspendOrganizationFailure =
  | "platform_admin_required"
  | "organization_not_found"
  | "not_suspended";

export type UnsuspendOrganizationResult =
  | {
      ok: true;
      organization: {
        id: string;
        suspendedAt: null;
      };
    }
  | {
      ok: false;
      reason: UnsuspendOrganizationFailure;
    };

export async function suspendOrganization(
  input: SuspendOrganizationInput,
): Promise<SuspendOrganizationResult> {
  return db.transaction().execute(async (trx) => {
    const admin = await trx
      .selectFrom("platform_admin")
      .select("user_id")
      .where("user_id", "=", input.userId)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    if (!admin) {
      return {
        ok: false,
        reason: "platform_admin_required",
      };
    }

    const reason = input.reason.trim();
    if (reason.length === 0 || reason.length > 500) {
      return { ok: false, reason: "invalid_reason" };
    }

    // Suspension is a platform-level lifecycle transition, so it owns the organization lock.
    const organization = await trx
      .selectFrom("organization")
      .select(["id", "name", "slug", "suspended_at"])
      .where("id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!organization) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    if (organization.suspended_at) {
      return {
        ok: false,
        reason: "already_suspended",
      };
    }

    const suspendedAt = new Date();

    await trx
      .updateTable("organization")
      .set({
        suspended_at: suspendedAt,
        updated_at: suspendedAt,
      })
      .where("id", "=", organization.id)
      .executeTakeFirstOrThrow();

    await trx
      .insertInto("organization_lifecycle_event")
      .values({
        organization_id: organization.id,
        action: "suspended",
        actor_user_id: input.userId,
        reason,
        internal_note: null,
        occurred_at: suspendedAt,
      })
      .execute();

    const owner = await primaryOwner(trx, organization.id);
    if (owner) {
      await insertOutboxEventInTransaction<
        typeof organizationLifecycleEventTypes.suspended,
        OrganizationSuspendedPayload
      >(trx, {
        aggregateType: "organization",
        aggregateId: organization.id,
        eventType: organizationLifecycleEventTypes.suspended,
        payload: {
          organizationId: organization.id,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          recipientName: owner.name,
          recipientEmail: owner.email,
          reason,
        },
        occurredAt: suspendedAt,
      });
    }

    return {
      ok: true,
      organization: {
        id: organization.id,
        suspendedAt: suspendedAt.toISOString(),
      },
    };
  });
}

export async function unsuspendOrganization(
  input: UnsuspendOrganizationInput,
): Promise<UnsuspendOrganizationResult> {
  return db.transaction().execute(async (trx) => {
    const admin = await trx
      .selectFrom("platform_admin")
      .select("user_id")
      .where("user_id", "=", input.userId)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    if (!admin) {
      return {
        ok: false,
        reason: "platform_admin_required",
      };
    }

    const organization = await trx
      .selectFrom("organization")
      .select(["id", "name", "slug", "suspended_at"])
      .where("id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!organization) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    if (!organization.suspended_at) {
      return {
        ok: false,
        reason: "not_suspended",
      };
    }

    const updatedAt = new Date();

    await trx
      .updateTable("organization")
      .set({
        suspended_at: null,
        updated_at: updatedAt,
      })
      .where("id", "=", organization.id)
      .executeTakeFirstOrThrow();

    await trx
      .insertInto("organization_lifecycle_event")
      .values({
        organization_id: organization.id,
        action: "unsuspended",
        actor_user_id: input.userId,
        reason: null,
        internal_note: input.internalNote?.trim() || null,
        occurred_at: updatedAt,
      })
      .execute();

    const owner = await primaryOwner(trx, organization.id);
    if (owner) {
      await insertOutboxEventInTransaction<
        typeof organizationLifecycleEventTypes.unsuspended,
        OrganizationUnsuspendedPayload
      >(trx, {
        aggregateType: "organization",
        aggregateId: organization.id,
        eventType: organizationLifecycleEventTypes.unsuspended,
        payload: {
          organizationId: organization.id,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          recipientName: owner.name,
          recipientEmail: owner.email,
        },
        occurredAt: updatedAt,
      });
    }

    return {
      ok: true,
      organization: {
        id: organization.id,
        suspendedAt: null,
      },
    };
  });
}
