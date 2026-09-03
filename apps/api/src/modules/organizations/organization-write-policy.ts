import type { Transaction } from "kysely";
import type { Database } from "../../db-types.js";

export type OrganizationWriteStateFailure =
  | "organization_archived"
  | "organization_suspended";

type RequireWritableOrganizationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: OrganizationWriteStateFailure;
    };

export async function requireWritableOrganization(
  trx: Transaction<Database>,
  organizationId: string,
): Promise<RequireWritableOrganizationResult> {
  // Lock lifecycle state so archive/suspension cannot race with this write.
  const organization = await trx
    .selectFrom("organization")
    .select(["archived_at", "suspended_at"])
    .where("id", "=", organizationId)
    .forUpdate()
    .executeTakeFirstOrThrow();

  // Platform suspension takes precedence over organization-managed lifecycle state.
  if (organization.suspended_at) {
    return {
      ok: false,
      reason: "organization_suspended",
    };
  }

  if (organization.archived_at) {
    return {
      ok: false,
      reason: "organization_archived",
    };
  }

  return {
    ok: true,
  };
}
