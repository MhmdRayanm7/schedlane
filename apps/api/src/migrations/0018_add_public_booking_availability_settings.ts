import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .addColumn("min_booking_notice_minutes", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("max_booking_horizon_days", "integer", (column) =>
      column.notNull().defaultTo(60),
    )
    .addColumn("public_booking_paused", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .execute();

  await db.schema
    .alterTable("organization")
    .addCheckConstraint(
      "organization_min_booking_notice_minutes_check",
      sql`min_booking_notice_minutes >= 0`,
    )
    .execute();
  await db.schema
    .alterTable("organization")
    .addCheckConstraint(
      "organization_max_booking_horizon_days_check",
      sql`max_booking_horizon_days >= 0`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .dropConstraint("organization_max_booking_horizon_days_check")
    .execute();
  await db.schema
    .alterTable("organization")
    .dropConstraint("organization_min_booking_notice_minutes_check")
    .execute();
  await db.schema
    .alterTable("organization")
    .dropColumn("public_booking_paused")
    .execute();
  await db.schema
    .alterTable("organization")
    .dropColumn("max_booking_horizon_days")
    .execute();
  await db.schema
    .alterTable("organization")
    .dropColumn("min_booking_notice_minutes")
    .execute();
}
