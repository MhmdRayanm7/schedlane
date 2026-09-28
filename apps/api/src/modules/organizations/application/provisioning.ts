import type { Transaction } from "kysely";
import type { Database } from "../../../db-types.js";

export function organizationSlugBase(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return normalized || "organization";
}

type ProvisionOrganizationInput = {
  name: string;
  ownerUserId: string;
  slug?: string;
};

export async function provisionOrganizationInTransaction(
  trx: Transaction<Database>,
  input: ProvisionOrganizationInput,
) {
  const base = input.slug ?? organizationSlugBase(input.name);
  const candidates = input.slug
    ? [input.slug]
    : Array.from({ length: 100 }, (_, index) =>
        index === 0
          ? base
          : `${base.slice(0, 72 - `${index + 1}`.length)}-${index + 1}`,
      );

  for (const slug of candidates) {
    const organization = await trx
      .insertInto("organization")
      .values({ name: input.name.trim(), slug })
      .onConflict((conflict) => conflict.column("slug").doNothing())
      .returning(["id", "slug", "name", "created_at"])
      .executeTakeFirst();
    if (!organization) continue;

    await trx
      .insertInto("membership")
      .values({
        organization_id: organization.id,
        user_id: input.ownerUserId,
        role: "owner",
      })
      .execute();
    return organization;
  }

  return null;
}
