import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("organization_lifecycle_event")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("organization_id", "uuid", (column) =>
      column.notNull().references("organization.id").onDelete("restrict"),
    )
    .addColumn("action", "text", (column) => column.notNull())
    .addColumn("actor_user_id", "text", (column) =>
      column
        .notNull()
        .references("platform_admin.user_id")
        .onDelete("restrict"),
    )
    .addColumn("reason", "text")
    .addColumn("internal_note", "text")
    .addColumn("occurred_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addCheckConstraint(
      "organization_lifecycle_event_action_valid",
      sql`action in ('manually_provisioned', 'suspended', 'unsuspended')`,
    )
    .addCheckConstraint(
      "organization_lifecycle_event_reason_valid",
      sql`(action = 'suspended' and reason is not null and length(trim(reason)) between 1 and 500)
        or (action <> 'suspended' and reason is null)`,
    )
    .addCheckConstraint(
      "organization_lifecycle_event_internal_note_length",
      sql`internal_note is null or length(internal_note) <= 2000`,
    )
    .execute();

  await db.schema
    .createIndex("organization_lifecycle_event_organization_occurred_idx")
    .on("organization_lifecycle_event")
    .columns(["organization_id", "occurred_at", "id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("organization_lifecycle_event").execute();
}
