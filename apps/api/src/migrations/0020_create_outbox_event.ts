import { type Kysely, type SqlBool, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("outbox_event")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("aggregate_type", "text", (column) => column.notNull())
    .addColumn("aggregate_id", "uuid", (column) => column.notNull())
    .addColumn("event_type", "text", (column) => column.notNull())
    .addColumn("payload", "jsonb", (column) => column.notNull())
    .addColumn("occurred_at", "timestamptz", (column) => column.notNull())
    .addColumn("published_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  await db.schema
    .createIndex("outbox_event_unpublished_created_at_id_idx")
    .on("outbox_event")
    .columns(["created_at", "id"])
    .where(sql<SqlBool>`published_at IS NULL`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("outbox_event").execute();
}
