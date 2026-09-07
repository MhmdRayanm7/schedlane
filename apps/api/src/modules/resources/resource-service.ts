import { db } from "../../db.js";
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
