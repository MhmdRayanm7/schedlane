import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("organization_weekly_hours")
    .addColumn("organization_id", "uuid", (column) =>
      column.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("weekday", "smallint", (column) => column.notNull())
    .addColumn("start_minute", "integer", (column) => column.notNull())
    .addColumn("end_minute", "integer", (column) => column.notNull())
    .addPrimaryKeyConstraint("organization_weekly_hours_pkey", [
      "organization_id",
      "weekday",
      "start_minute",
    ])
    .addCheckConstraint(
      "organization_weekly_hours_weekday_check",
      sql`weekday BETWEEN 1 AND 7`,
    )
    .addCheckConstraint(
      "organization_weekly_hours_start_minute_check",
      sql`start_minute >= 0 AND start_minute < 1440`,
    )
    .addCheckConstraint(
      "organization_weekly_hours_end_minute_check",
      sql`end_minute > 0 AND end_minute <= 1440`,
    )
    .addCheckConstraint(
      "organization_weekly_hours_interval_check",
      sql`start_minute < end_minute`,
    )
    .execute();

  // Half-open local intervals allow adjacency but never overlap within a day.
  await sql`
    ALTER TABLE organization_weekly_hours
    ADD CONSTRAINT organization_weekly_hours_no_overlap
    EXCLUDE USING gist (
      organization_id WITH =,
      weekday WITH =,
      int4range(start_minute, end_minute, '[)') WITH &&
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("organization_weekly_hours").execute();
}
