import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("resource")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("organization_id", "uuid", (column) =>
      column.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("user_id", "text", (column) =>
      column.references("user.id").onDelete("set null"),
    )
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("deactivated_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addCheckConstraint(
      "resource_name_check",
      sql`name = btrim(name) AND name <> ''`,
    )
    .execute();

  // One user may be linked to at most one resource in the same organization.
  await sql`
    CREATE UNIQUE INDEX resource_organization_user_unique
    ON resource (organization_id, user_id)
    WHERE user_id IS NOT NULL
  `.execute(db);

  await db.schema
    .createIndex("resource_organization_id_idx")
    .on("resource")
    .column("organization_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("resource").execute();
}
