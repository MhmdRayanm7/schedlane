import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .addColumn("slot_interval_minutes", "integer", (column) =>
      column.notNull().defaultTo(15),
    )
    .execute();
  await db.schema
    .alterTable("organization")
    .addCheckConstraint(
      "organization_slot_interval_minutes_check",
      sql`slot_interval_minutes >= 1 AND slot_interval_minutes <= 1440`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .dropConstraint("organization_slot_interval_minutes_check")
    .execute();
  await db.schema
    .alterTable("organization")
    .dropColumn("slot_interval_minutes")
    .execute();
}
