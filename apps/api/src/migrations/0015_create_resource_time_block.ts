import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("resource_time_block")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("organization_id", "uuid", (column) => column.notNull())
    .addColumn("resource_id", "uuid", (column) => column.notNull())
    .addColumn("local_date", "date", (column) => column.notNull())
    .addColumn("start_minute", "integer", (column) => column.notNull())
    .addColumn("end_minute", "integer", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addForeignKeyConstraint(
      "resource_time_block_resource_organization_fk",
      ["resource_id", "organization_id"],
      "resource",
      ["id", "organization_id"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .addCheckConstraint(
      "resource_time_block_start_minute_check",
      sql`start_minute >= 0 AND start_minute < 1440`,
    )
    .addCheckConstraint(
      "resource_time_block_end_minute_check",
      sql`end_minute > 0 AND end_minute <= 1440`,
    )
    .addCheckConstraint(
      "resource_time_block_interval_check",
      sql`start_minute < end_minute`,
    )
    .execute();
  await sql`
    ALTER TABLE resource_time_block
    ADD CONSTRAINT resource_time_block_no_overlap
    EXCLUDE USING gist (
      organization_id WITH =,
      resource_id WITH =,
      local_date WITH =,
      int4range(start_minute, end_minute, '[)') WITH &&
    )
  `.execute(db);
  await db.schema
    .createIndex("resource_time_block_resource_date_idx")
    .on("resource_time_block")
    .columns(["organization_id", "resource_id", "local_date", "start_minute"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("resource_time_block").execute();
}
