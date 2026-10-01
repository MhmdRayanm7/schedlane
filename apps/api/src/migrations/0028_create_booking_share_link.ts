import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("booking_share_link")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("organization_id", "uuid", (column) =>
      column.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("token", "text", (column) => column.notNull().unique())
    .addColumn("service_id", "uuid")
    .addColumn("resource_id", "uuid")
    .addColumn("created_by_user_id", "text", (column) =>
      column.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("revoked_at", "timestamptz")
    .addColumn("revoked_by_user_id", "text", (column) =>
      column.references("user.id"),
    )
    .addCheckConstraint(
      "booking_share_link_scope_check",
      sql`service_id IS NOT NULL OR resource_id IS NOT NULL`,
    )
    .addForeignKeyConstraint(
      "booking_share_link_service_organization_fk",
      ["service_id", "organization_id"],
      "service",
      ["id", "organization_id"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .addForeignKeyConstraint(
      "booking_share_link_resource_organization_fk",
      ["resource_id", "organization_id"],
      "resource",
      ["id", "organization_id"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .execute();

  await db.schema
    .createIndex("booking_share_link_organization_created_idx")
    .on("booking_share_link")
    .columns(["organization_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("booking_share_link_organization_token_idx")
    .unique()
    .on("booking_share_link")
    .columns(["organization_id", "token"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("booking_share_link").execute();
}
