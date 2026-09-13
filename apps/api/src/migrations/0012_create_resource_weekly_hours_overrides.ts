import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("resource_weekly_hours_override")
    .addColumn("organization_id", "uuid", (column) => column.notNull())
    .addColumn("resource_id", "uuid", (column) => column.notNull())
    .addColumn("weekday", "smallint", (column) => column.notNull())
    .addPrimaryKeyConstraint("resource_weekly_hours_override_pkey", [
      "organization_id",
      "resource_id",
      "weekday",
    ])
    .addCheckConstraint(
      "resource_weekly_hours_override_weekday_check",
      sql`weekday BETWEEN 1 AND 7`,
    )
    .addForeignKeyConstraint(
      "resource_weekly_hours_override_resource_organization_fk",
      ["resource_id", "organization_id"],
      "resource",
      ["id", "organization_id"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .execute();

  await db.schema
    .createTable("resource_weekly_hours_interval")
    .addColumn("organization_id", "uuid", (column) => column.notNull())
    .addColumn("resource_id", "uuid", (column) => column.notNull())
    .addColumn("weekday", "smallint", (column) => column.notNull())
    .addColumn("start_minute", "integer", (column) => column.notNull())
    .addColumn("end_minute", "integer", (column) => column.notNull())
    .addPrimaryKeyConstraint("resource_weekly_hours_interval_pkey", [
      "organization_id",
      "resource_id",
      "weekday",
      "start_minute",
    ])
    .addForeignKeyConstraint(
      "resource_weekly_hours_interval_override_fk",
      ["organization_id", "resource_id", "weekday"],
      "resource_weekly_hours_override",
      ["organization_id", "resource_id", "weekday"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .addCheckConstraint(
      "resource_weekly_hours_interval_weekday_check",
      sql`weekday BETWEEN 1 AND 7`,
    )
    .addCheckConstraint(
      "resource_weekly_hours_interval_start_minute_check",
      sql`start_minute >= 0 AND start_minute < 1440`,
    )
    .addCheckConstraint(
      "resource_weekly_hours_interval_end_minute_check",
      sql`end_minute > 0 AND end_minute <= 1440`,
    )
    .addCheckConstraint(
      "resource_weekly_hours_interval_order_check",
      sql`start_minute < end_minute`,
    )
    .execute();

  await sql`
    ALTER TABLE resource_weekly_hours_interval
    ADD CONSTRAINT resource_weekly_hours_no_overlap
    EXCLUDE USING gist (
      organization_id WITH =,
      resource_id WITH =,
      weekday WITH =,
      int4range(start_minute, end_minute, '[)') WITH &&
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("resource_weekly_hours_interval").execute();
  await db.schema.dropTable("resource_weekly_hours_override").execute();
}
