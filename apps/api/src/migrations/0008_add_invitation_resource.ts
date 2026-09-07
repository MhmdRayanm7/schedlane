import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization_invitation")
    .addColumn("resource_id", "uuid", (column) =>
      column.references("resource.id").onDelete("restrict"),
    )
    .execute();

  // Only Staff invitations may target a Resource.
  await db.schema
    .alterTable("organization_invitation")
    .addCheckConstraint(
      "organization_invitation_resource_role_check",
      sql`resource_id IS NULL OR role = 'staff'`,
    )
    .execute();

  // A Resource cannot have multiple active invitations at the same time.
  await sql`
    CREATE UNIQUE INDEX organization_invitation_open_resource_unique
    ON organization_invitation (resource_id)
    WHERE
      resource_id IS NOT NULL
      AND accepted_at IS NULL
      AND revoked_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("organization_invitation_open_resource_unique")
    .execute();

  await db.schema
    .alterTable("organization_invitation")
    .dropConstraint("organization_invitation_resource_role_check")
    .execute();

  await db.schema
    .alterTable("organization_invitation")
    .dropColumn("resource_id")
    .execute();
}
