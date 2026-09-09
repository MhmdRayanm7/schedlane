import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .addColumn("pricing_enabled", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .execute();

  await db.schema
    .createTable("service")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("organization_id", "uuid", (column) =>
      column.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("duration_minutes", "integer", (column) => column.notNull())
    .addColumn("price_agorot", "integer")
    .addColumn("buffer_after_minutes", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("display_order", "integer", (column) => column.notNull())
    .addColumn("deactivated_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addCheckConstraint(
      "service_name_check",
      sql`name = btrim(name) AND name <> ''`,
    )
    .addCheckConstraint(
      "service_duration_minutes_check",
      sql`duration_minutes > 0`,
    )
    .addCheckConstraint(
      "service_price_agorot_check",
      sql`price_agorot IS NULL OR price_agorot >= 0`,
    )
    .addCheckConstraint(
      "service_buffer_after_minutes_check",
      sql`buffer_after_minutes >= 0`,
    )
    .addCheckConstraint("service_display_order_check", sql`display_order >= 0`)
    .execute();

  await db.schema
    .createIndex("service_organization_id_idx")
    .on("service")
    .column("organization_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("service").execute();

  await db.schema
    .alterTable("organization")
    .dropColumn("pricing_enabled")
    .execute();
}
