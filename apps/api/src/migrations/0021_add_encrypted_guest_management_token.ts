import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("booking")
    .addColumn("guest_management_token_encrypted", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("booking")
    .dropColumn("guest_management_token_encrypted")
    .execute();
}
