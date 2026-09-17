import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("booking")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("organization_id", "uuid", (column) => column.notNull())
    .addColumn("resource_id", "uuid", (column) => column.notNull())
    .addColumn("service_id", "uuid", (column) => column.notNull())
    .addColumn("public_reference", "text", (column) =>
      column.notNull().unique(),
    )
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("confirmed"),
    )
    .addColumn("start_at", "timestamptz", (column) => column.notNull())
    .addColumn("service_end_at", "timestamptz", (column) => column.notNull())
    .addColumn("occupied_until_at", "timestamptz", (column) => column.notNull())
    .addColumn("duration_minutes", "integer", (column) => column.notNull())
    .addColumn("buffer_after_minutes", "integer", (column) => column.notNull())
    .addColumn("price_agorot", "integer")
    .addColumn("guest_name", "text", (column) => column.notNull())
    .addColumn("guest_phone", "text")
    .addColumn("guest_email", "text")
    .addColumn("customer_note", "text")
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("cancelled_by_user_id", "text")
    .addColumn("cancellation_reason", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addForeignKeyConstraint(
      "booking_organization_fk",
      ["organization_id"],
      "organization",
      ["id"],
    )
    .addForeignKeyConstraint(
      "booking_resource_organization_fk",
      ["resource_id", "organization_id"],
      "resource",
      ["id", "organization_id"],
    )
    .addForeignKeyConstraint(
      "booking_service_organization_fk",
      ["service_id", "organization_id"],
      "service",
      ["id", "organization_id"],
    )
    .addForeignKeyConstraint(
      "booking_cancelled_by_user_fk",
      ["cancelled_by_user_id"],
      "user",
      ["id"],
      (constraint) => constraint.onDelete("set null"),
    )
    .addCheckConstraint(
      "booking_status_check",
      sql`status IN ('confirmed', 'cancelled', 'no_show')`,
    )
    .addCheckConstraint(
      "booking_temporal_order_check",
      sql`start_at < service_end_at AND service_end_at <= occupied_until_at`,
    )
    .addCheckConstraint(
      "booking_duration_minutes_check",
      sql`duration_minutes > 0`,
    )
    .addCheckConstraint(
      "booking_buffer_after_minutes_check",
      sql`buffer_after_minutes >= 0`,
    )
    .addCheckConstraint(
      "booking_service_end_snapshot_check",
      sql`service_end_at = start_at + duration_minutes * interval '1 minute'`,
    )
    .addCheckConstraint(
      "booking_occupied_until_snapshot_check",
      sql`occupied_until_at = service_end_at + buffer_after_minutes * interval '1 minute'`,
    )
    .addCheckConstraint(
      "booking_price_agorot_check",
      sql`price_agorot IS NULL OR price_agorot >= 0`,
    )
    .addCheckConstraint(
      "booking_guest_name_check",
      sql`guest_name = btrim(guest_name) AND guest_name <> ''`,
    )
    .addCheckConstraint(
      "booking_cancellation_state_check",
      sql`(
        status = 'cancelled' AND cancelled_at IS NOT NULL
      ) OR (
        status <> 'cancelled'
        AND cancelled_at IS NULL
        AND cancelled_by_user_id IS NULL
        AND cancellation_reason IS NULL
      )`,
    )
    .execute();

  await sql`
    ALTER TABLE booking
    ADD CONSTRAINT booking_confirmed_resource_occupancy_excl
    EXCLUDE USING gist (
      resource_id WITH =,
      tstzrange(start_at, occupied_until_at, '[)') WITH &&
    )
    WHERE (status = 'confirmed')
  `.execute(db);

  await db.schema
    .createIndex("booking_organization_start_at_idx")
    .on("booking")
    .columns(["organization_id", "start_at"])
    .execute();
  await db.schema
    .createIndex("booking_resource_start_at_idx")
    .on("booking")
    .columns(["resource_id", "start_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("booking").execute();
}
