import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("platform_admin")
    .addColumn("user_id", "text", (col) =>
      col.primaryKey().references("user.id").onDelete("restrict"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("revoked_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("organization")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("published_at", "timestamptz")
    .addColumn("suspended_at", "timestamptz")
    .addColumn("archived_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "organization_name_not_blank",
      sql`length(trim(name)) > 0`,
    )
    .addCheckConstraint(
      "organization_slug_format",
      sql`slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    )
    .addCheckConstraint(
      "organization_archived_not_published",
      sql`archived_at is null or published_at is null`,
    )
    .execute();

  await db.schema
    .createTable("organization_request")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("requested_by_user_id", "text", (col) =>
      col.notNull().references("user.id").onDelete("restrict"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("reviewed_by_user_id", "text", (col) =>
      col.references("platform_admin.user_id").onDelete("restrict"),
    )
    .addColumn("organization_id", "uuid", (col) =>
      col.references("organization.id").onDelete("restrict"),
    )
    .addColumn("rejection_reason", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("decided_at", "timestamptz")
    .addUniqueConstraint("organization_request_organization_id_unique", [
      "organization_id",
    ])
    .addCheckConstraint(
      "organization_request_name_not_blank",
      sql`length(trim(name)) > 0`,
    )
    .addCheckConstraint(
      "organization_request_status_valid",
      sql`status in ('pending', 'approved', 'rejected')`,
    )
    .addCheckConstraint(
      "organization_request_state_valid",
      sql`
        (
          status = 'pending'
          and decided_at is null
          and reviewed_by_user_id is null
          and organization_id is null
          and rejection_reason is null
        )
        or
        (
          status = 'approved'
          and decided_at is not null
          and reviewed_by_user_id is not null
          and organization_id is not null
          and rejection_reason is null
        )
        or
        (
          status = 'rejected'
          and decided_at is not null
          and reviewed_by_user_id is not null
          and organization_id is null
        )
      `,
    )
    .execute();

  await db.schema
    .createTable("membership")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("organization_id", "uuid", (col) =>
      col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("user_id", "text", (col) =>
      col.notNull().references("user.id").onDelete("restrict"),
    )
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("membership_organization_user_unique", [
      "organization_id",
      "user_id",
    ])
    .addCheckConstraint(
      "membership_role_valid",
      sql`role in ('owner', 'manager', 'staff')`,
    )
    .execute();

  await db.schema
    .createIndex("organization_request_requested_by_user_id_idx")
    .on("organization_request")
    .column("requested_by_user_id")
    .execute();

  await db.schema
    .createIndex("organization_request_status_created_at_idx")
    .on("organization_request")
    .columns(["status", "created_at"])
    .execute();

  await db.schema
    .createIndex("membership_user_id_idx")
    .on("membership")
    .column("user_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("membership").execute();
  await db.schema.dropTable("organization_request").execute();
  await db.schema.dropTable("organization").execute();
  await db.schema.dropTable("platform_admin").execute();
}
