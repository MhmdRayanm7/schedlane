import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("organization_date_override")
    .addColumn("organization_id", "uuid", (column) => column.notNull())
    .addColumn("local_date", "date", (column) => column.notNull())
    .addPrimaryKeyConstraint("organization_date_override_pkey", [
      "organization_id",
      "local_date",
    ])
    .addForeignKeyConstraint(
      "organization_date_override_organization_fk",
      ["organization_id"],
      "organization",
      ["id"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .execute();

  await db.schema
    .createTable("organization_date_override_interval")
    .addColumn("organization_id", "uuid", (column) => column.notNull())
    .addColumn("local_date", "date", (column) => column.notNull())
    .addColumn("start_minute", "integer", (column) => column.notNull())
    .addColumn("end_minute", "integer", (column) => column.notNull())
    .addPrimaryKeyConstraint("organization_date_override_interval_pkey", [
      "organization_id",
      "local_date",
      "start_minute",
    ])
    .addForeignKeyConstraint(
      "organization_date_override_interval_override_fk",
      ["organization_id", "local_date"],
      "organization_date_override",
      ["organization_id", "local_date"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .addCheckConstraint(
      "organization_date_override_interval_start_minute_check",
      sql`start_minute >= 0 AND start_minute < 1440`,
    )
    .addCheckConstraint(
      "organization_date_override_interval_end_minute_check",
      sql`end_minute > 0 AND end_minute <= 1440`,
    )
    .addCheckConstraint(
      "organization_date_override_interval_order_check",
      sql`start_minute < end_minute`,
    )
    .execute();

  await sql`
    ALTER TABLE organization_date_override_interval
    ADD CONSTRAINT organization_date_override_no_overlap
    EXCLUDE USING gist (
      organization_id WITH =,
      local_date WITH =,
      int4range(start_minute, end_minute, '[)') WITH &&
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("organization_date_override_interval").execute();
  await db.schema.dropTable("organization_date_override").execute();
}
