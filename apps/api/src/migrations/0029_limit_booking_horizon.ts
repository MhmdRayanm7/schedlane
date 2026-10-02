import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .dropConstraint("organization_max_booking_horizon_days_check")
    .execute();
  await db.schema
    .alterTable("organization")
    .addCheckConstraint(
      "organization_max_booking_horizon_days_check",
      sql`max_booking_horizon_days >= 0 AND max_booking_horizon_days <= 365`,
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
    .addCheckConstraint(
      "organization_max_booking_horizon_days_check",
      sql`max_booking_horizon_days >= 0`,
    )
    .execute();
}
