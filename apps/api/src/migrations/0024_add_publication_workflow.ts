import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .dropConstraint("organization_archived_not_published")
    .execute();

  await db.schema
    .createTable("organization_publication_request")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("organization_id", "uuid", (column) =>
      column.notNull().references("organization.id").onDelete("restrict"),
    )
    .addColumn("requested_by_user_id", "text", (column) =>
      column.notNull().references("user.id").onDelete("restrict"),
    )
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("pending"),
    )
    .addColumn("requested_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("reviewed_by_user_id", "text", (column) =>
      column.references("platform_admin.user_id").onDelete("restrict"),
    )
    .addColumn("reviewed_at", "timestamptz")
    .addColumn("rejection_reason", "text")
    .addCheckConstraint(
      "organization_publication_request_status_valid",
      sql`status in ('pending', 'approved', 'rejected')`,
    )
    .addCheckConstraint(
      "organization_publication_request_state_valid",
      sql`
        (
          status = 'pending'
          and reviewed_by_user_id is null
          and reviewed_at is null
          and rejection_reason is null
        )
        or
        (
          status = 'approved'
          and reviewed_by_user_id is not null
          and reviewed_at is not null
          and rejection_reason is null
        )
        or
        (
          status = 'rejected'
          and reviewed_by_user_id is not null
          and reviewed_at is not null
          and length(trim(rejection_reason)) > 0
        )
      `,
    )
    .execute();

  await sql`
    create unique index organization_publication_request_one_pending_idx
    on organization_publication_request (organization_id)
    where status = 'pending'
  `.execute(db);

  await db.schema
    .createIndex("organization_publication_request_status_requested_idx")
    .on("organization_publication_request")
    .columns(["status", "requested_at", "id"])
    .execute();

  await db.schema
    .createIndex("organization_publication_request_organization_idx")
    .on("organization_publication_request")
    .columns(["organization_id", "requested_at"])
    .execute();

  await db.schema
    .createTable("organization_unpublication")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("organization_id", "uuid", (column) =>
      column.notNull().references("organization.id").onDelete("restrict"),
    )
    .addColumn("unpublished_by_user_id", "text", (column) =>
      column
        .notNull()
        .references("platform_admin.user_id")
        .onDelete("restrict"),
    )
    .addColumn("reason", "text", (column) => column.notNull())
    .addColumn("unpublished_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addCheckConstraint(
      "organization_unpublication_reason_not_blank",
      sql`length(trim(reason)) > 0`,
    )
    .execute();

  await db.schema
    .createIndex("organization_unpublication_organization_idx")
    .on("organization_unpublication")
    .columns(["organization_id", "unpublished_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("organization_unpublication").execute();
  await db.schema.dropTable("organization_publication_request").execute();
  await db.schema
    .alterTable("organization")
    .addCheckConstraint(
      "organization_archived_not_published",
      sql`archived_at is null or published_at is null`,
    )
    .execute();
}
