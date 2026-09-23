import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("consumer_receipt")
    .addColumn("consumer_name", "text", (col) => col.notNull())
    .addColumn("event_id", "uuid", (col) => col.notNull())
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("outcome", "text", (col) => col.notNull())
    .addColumn("processed_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`current_timestamp`),
    )
    .addPrimaryKeyConstraint("consumer_receipt_pkey", [
      "consumer_name",
      "event_id",
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("consumer_receipt").execute();
}
