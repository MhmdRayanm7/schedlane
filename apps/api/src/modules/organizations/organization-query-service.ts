import { db } from "../../db.js";
import type { MembershipRole } from "../../db-types.js";

type ListUserOrganizationsInput = {
  userId: string;
};

export type ListUserOrganizationsResult = {
  items: Array<{
    id: string;
    slug: string;
    name: string;
    role: MembershipRole;
    publishedAt: string | null;
    suspendedAt: string | null;
    archivedAt: string | null;
  }>;
};

export type UserOrganization = {
  id: string;
  slug: string;
  name: string;
  role: MembershipRole;
  publishedAt: string | null;
  suspendedAt: string | null;
  archivedAt: string | null;
};

type GetUserOrganizationInput = {
  userId: string;
  organizationId: string;
};

export async function listUserOrganizations(
  input: ListUserOrganizationsInput,
): Promise<ListUserOrganizationsResult> {
  // Membership is the source of truth for which organizations a user belongs to.
  const rows = await db
    .selectFrom("membership")
    .innerJoin("organization", "organization.id", "membership.organization_id")
    .select([
      "organization.id",
      "organization.slug",
      "organization.name",
      "organization.published_at",
      "organization.suspended_at",
      "organization.archived_at",
      "membership.role",
    ])
    .where("membership.user_id", "=", input.userId)
    .orderBy("organization.name", "asc")
    .execute();

  // Keep the API contract independent from database naming and Date objects.
  return {
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      publishedAt: row.published_at?.toISOString() ?? null,
      suspendedAt: row.suspended_at?.toISOString() ?? null,
      archivedAt: row.archived_at?.toISOString() ?? null,
    })),
  };
}

export async function getUserOrganization(
  input: GetUserOrganizationInput,
): Promise<UserOrganization | null> {
  // Membership proves access and gives us the user's role in this organization.
  const row = await db
    .selectFrom("membership")
    .innerJoin("organization", "organization.id", "membership.organization_id")
    .select([
      "organization.id",
      "organization.slug",
      "organization.name",
      "organization.published_at",
      "organization.suspended_at",
      "organization.archived_at",
      "membership.role",
    ])
    .where("membership.user_id", "=", input.userId)
    .where("membership.organization_id", "=", input.organizationId)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    publishedAt: row.published_at?.toISOString() ?? null,
    suspendedAt: row.suspended_at?.toISOString() ?? null,
    archivedAt: row.archived_at?.toISOString() ?? null,
  };
}
