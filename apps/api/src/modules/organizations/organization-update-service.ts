import { db } from "../../db.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "./organization-write-policy.js";

type RenameOrganizationInput = {
  userId: string;
  organizationId: string;
  name: string;
};

type RenameOrganizationFailure =
  | "organization_not_found"
  | "insufficient_role"
  | OrganizationWriteStateFailure;

export type RenameOrganizationResult =
  | {
      ok: true;
      organization: {
        id: string;
        slug: string;
        name: string;
        updatedAt: string;
      };
    }
  | {
      ok: false;
      reason: RenameOrganizationFailure;
    };

export async function renameOrganization(
  input: RenameOrganizationInput,
): Promise<RenameOrganizationResult> {
  return db.transaction().execute(async (trx) => {
    // Lock the membership so authorization cannot change during this operation.
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

    const updatedAt = new Date();

    const organization = await trx
      .updateTable("organization")
      .set({
        name: input.name.trim(),
        updated_at: updatedAt,
      })
      .where("id", "=", input.organizationId)
      .returning(["id", "slug", "name"])
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        updatedAt: updatedAt.toISOString(),
      },
    };
  });
}
