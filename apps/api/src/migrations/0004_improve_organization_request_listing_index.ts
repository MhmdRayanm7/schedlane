import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("organization_request_status_created_at_idx")
    .execute();

  await db.schema
    .createIndex("organization_request_status_created_at_id_idx")
    .on("organization_request")
    .columns(["status", "created_at", "id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("organization_request_status_created_at_id_idx")
    .execute();

  await db.schema
    .createIndex("organization_request_status_created_at_idx")
    .on("organization_request")
    .columns(["status", "created_at"])
    .execute();
}
