import { db } from "../../db.js";

type ArchiveOrganizationInput = {
  userId: string;
  organizationId: string;
};

type ArchiveOrganizationFailure =
  | "organization_not_found"
  | "owner_required"
  | "already_archived";

export type ArchiveOrganizationResult =
  | {
      ok: true;
      organization: {
        id: string;
        archivedAt: string;
      };
    }
  | {
      ok: false;
      reason: ArchiveOrganizationFailure;
    };

type RestoreOrganizationInput = {
  userId: string;
  organizationId: string;
};

type RestoreOrganizationFailure =
  | "organization_not_found"
  | "owner_required"
  | "not_archived";

export type RestoreOrganizationResult =
  | {
      ok: true;
      organization: {
        id: string;
        archivedAt: null;
      };
    }
  | {
      ok: false;
      reason: RestoreOrganizationFailure;
    };

export async function archiveOrganization(
  input: ArchiveOrganizationInput,
): Promise<ArchiveOrganizationResult> {
  return db.transaction().execute(async (trx) => {
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

    if (membership.role !== "owner") {
      return {
        ok: false,
        reason: "owner_required",
      };
    }

    const organization = await trx
      .selectFrom("organization")
      .select(["id", "archived_at"])
      .where("id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirstOrThrow();

    if (organization.archived_at) {
      return {
        ok: false,
        reason: "already_archived",
      };
    }

    const archivedAt = new Date();

    await trx
      .updateTable("organization")
      .set({
        archived_at: archivedAt,
        published_at: null,
        updated_at: archivedAt,
      })
      .where("id", "=", input.organizationId)
      .execute();

    return {
      ok: true,
      organization: {
        id: organization.id,
        archivedAt: archivedAt.toISOString(),
      },
    };
  });
}

export async function restoreOrganization(
  input: RestoreOrganizationInput,
): Promise<RestoreOrganizationResult> {
  return db.transaction().execute(async (trx) => {
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

    if (membership.role !== "owner") {
      return {
        ok: false,
        reason: "owner_required",
      };
    }

    const organization = await trx
      .selectFrom("organization")
      .select(["id", "archived_at"])
      .where("id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirstOrThrow();

    if (!organization.archived_at) {
      return {
        ok: false,
        reason: "not_archived",
      };
    }

    const updatedAt = new Date();

    await trx
      .updateTable("organization")
      .set({
        archived_at: null,
        updated_at: updatedAt,
      })
      .where("id", "=", input.organizationId)
      .execute();

    return {
      ok: true,
      organization: {
        id: organization.id,
        archivedAt: null,
      },
    };
  });
}
