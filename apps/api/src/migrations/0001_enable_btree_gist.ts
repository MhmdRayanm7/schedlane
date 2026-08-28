import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists btree_gist`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop extension if exists btree_gist`.execute(db);
}
