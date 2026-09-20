import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .addColumn("cancellation_cutoff_minutes", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .execute();
  await db.schema
    .alterTable("organization")
    .addCheckConstraint(
      "organization_cancellation_cutoff_minutes_check",
      sql`cancellation_cutoff_minutes >= 0`,
    )
    .execute();

  await db.schema
    .alterTable("booking")
    .addColumn("cancellation_cutoff_minutes", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("guest_management_token_hash", "text")
    .execute();
  await db.schema
    .alterTable("booking")
    .addCheckConstraint(
      "booking_cancellation_cutoff_minutes_check",
      sql`cancellation_cutoff_minutes >= 0`,
    )
    .execute();
  await db.schema
    .alterTable("booking")
    .addUniqueConstraint("booking_guest_management_token_hash_key", [
      "guest_management_token_hash",
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("booking")
    .dropConstraint("booking_guest_management_token_hash_key")
    .execute();
  await db.schema
    .alterTable("booking")
    .dropConstraint("booking_cancellation_cutoff_minutes_check")
    .execute();
  await db.schema
    .alterTable("booking")
    .dropColumn("guest_management_token_hash")
    .execute();
  await db.schema
    .alterTable("booking")
    .dropColumn("cancellation_cutoff_minutes")
    .execute();
  await db.schema
    .alterTable("organization")
    .dropConstraint("organization_cancellation_cutoff_minutes_check")
    .execute();
  await db.schema
    .alterTable("organization")
    .dropColumn("cancellation_cutoff_minutes")
    .execute();
}
