import { type Kysely, type SqlBool, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("booking_reminder")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("booking_id", "uuid", (column) =>
      column.notNull().references("booking.id").onDelete("cascade"),
    )
    .addColumn("scheduled_for_start_at", "timestamptz", (column) =>
      column.notNull(),
    )
    .addColumn("due_at", "timestamptz", (column) => column.notNull())
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("pending"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("dispatched_at", "timestamptz")
    .addColumn("sent_at", "timestamptz")
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("skipped_at", "timestamptz")
    .addColumn("skip_reason", "text")
    .addCheckConstraint(
      "booking_reminder_status_check",
      sql`status IN ('pending', 'dispatched', 'sent', 'cancelled', 'skipped')`,
    )
    .addCheckConstraint(
      "booking_reminder_due_at_check",
      sql`due_at = scheduled_for_start_at - interval '24 hours'`,
    )
    .addCheckConstraint(
      "booking_reminder_state_check",
      sql`(
        status = 'pending'
        AND dispatched_at IS NULL AND sent_at IS NULL
        AND cancelled_at IS NULL AND skipped_at IS NULL AND skip_reason IS NULL
      ) OR (
        status = 'dispatched'
        AND dispatched_at IS NOT NULL AND sent_at IS NULL
        AND cancelled_at IS NULL AND skipped_at IS NULL AND skip_reason IS NULL
      ) OR (
        status = 'sent'
        AND dispatched_at IS NOT NULL AND sent_at IS NOT NULL
        AND cancelled_at IS NULL AND skipped_at IS NULL AND skip_reason IS NULL
      ) OR (
        status = 'cancelled'
        AND sent_at IS NULL AND cancelled_at IS NOT NULL
        AND skipped_at IS NULL AND skip_reason IS NULL
      ) OR (
        status = 'skipped'
        AND sent_at IS NULL AND cancelled_at IS NULL
        AND skipped_at IS NOT NULL AND length(trim(skip_reason)) > 0
      )`,
    )
    .execute();

  await db.schema
    .createIndex("booking_reminder_pending_due_idx")
    .on("booking_reminder")
    .columns(["due_at", "id"])
    .where(sql<SqlBool>`status = 'pending'`)
    .execute();

  await db.schema
    .createIndex("booking_reminder_booking_start_idx")
    .on("booking_reminder")
    .columns(["booking_id", "scheduled_for_start_at", "created_at"])
    .execute();

  await db.schema
    .createIndex("booking_reminder_one_pending_per_booking_idx")
    .unique()
    .on("booking_reminder")
    .column("booking_id")
    .where(sql<SqlBool>`status = 'pending'`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("booking_reminder").execute();
}
