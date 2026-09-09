import type { Transaction } from "kysely";
import type { Database } from "../../db-types.js";

export async function lockOrganizationMemberships(
  trx: Transaction<Database>,
  organizationId: string,
) {
  // Stable row lock ordering lets callers serialize cross-membership invariants deterministically.
  return trx
    .selectFrom("membership")
    .select(["id", "user_id", "role"])
    .where("organization_id", "=", organizationId)
    .orderBy("id", "asc")
    .forUpdate()
    .execute();
}
