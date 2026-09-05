import { db } from "../../db.js";

type SuspendOrganizationInput = {
  userId: string;
  organizationId: string;
};

type SuspendOrganizationFailure =
  | "platform_admin_required"
  | "organization_not_found"
  | "already_suspended";

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
};

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

    // Suspension is a platform-level lifecycle transition, so it owns the organization lock.
    const organization = await trx
      .selectFrom("organization")
      .select(["id", "suspended_at"])
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
        // Suspension immediately removes the organization from public booking.
        published_at: null,
        updated_at: suspendedAt,
      })
      .where("id", "=", organization.id)
      .executeTakeFirstOrThrow();

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
      .select(["id", "suspended_at"])
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

    return {
      ok: true,
      organization: {
        id: organization.id,
        suspendedAt: null,
      },
    };
  });
}
