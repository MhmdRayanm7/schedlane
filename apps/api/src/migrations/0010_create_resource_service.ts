import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("resource")
    .addUniqueConstraint("resource_id_organization_id_unique", [
      "id",
      "organization_id",
    ])
    .execute();
  await db.schema
    .alterTable("service")
    .addUniqueConstraint("service_id_organization_id_unique", [
      "id",
      "organization_id",
    ])
    .execute();

  await db.schema
    .createTable("resource_service")
    .addColumn("organization_id", "uuid", (column) => column.notNull())
    .addColumn("resource_id", "uuid", (column) => column.notNull())
    .addColumn("service_id", "uuid", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addPrimaryKeyConstraint("resource_service_pkey", [
      "resource_id",
      "service_id",
    ])
    .addForeignKeyConstraint(
      "resource_service_resource_organization_fk",
      ["resource_id", "organization_id"],
      "resource",
      ["id", "organization_id"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .addForeignKeyConstraint(
      "resource_service_service_organization_fk",
      ["service_id", "organization_id"],
      "service",
      ["id", "organization_id"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .execute();

  await db.schema
    .createIndex("resource_service_service_organization_idx")
    .on("resource_service")
    .columns(["service_id", "organization_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("resource_service").execute();
  await db.schema
    .alterTable("service")
    .dropConstraint("service_id_organization_id_unique")
    .execute();
  await db.schema
    .alterTable("resource")
    .dropConstraint("resource_id_organization_id_unique")
    .execute();
}
