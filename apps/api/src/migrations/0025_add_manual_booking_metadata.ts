import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("booking")
    .dropConstraint("booking_guest_name_check")
    .execute();
  await db.schema
    .alterTable("booking")
    .alterColumn("guest_name", (column) => column.dropNotNull())
    .execute();
  await db.schema
    .alterTable("booking")
    .addCheckConstraint(
      "booking_guest_name_check",
      sql`guest_name IS NULL OR (guest_name = btrim(guest_name) AND guest_name <> '')`,
    )
    .execute();

  await db.schema.alterTable("booking").addColumn("source", "text").execute();
  await sql`UPDATE booking SET source = 'public'`.execute(db);
  await db.schema
    .alterTable("booking")
    .alterColumn("source", (column) => column.setNotNull())
    .execute();
  await db.schema
    .alterTable("booking")
    .addCheckConstraint(
      "booking_source_check",
      sql`source IN ('public', 'manual')`,
    )
    .execute();

  await db.schema
    .alterTable("booking")
    .addColumn("created_by_user_id", "text")
    .execute();
  await db.schema
    .alterTable("booking")
    .addForeignKeyConstraint(
      "booking_created_by_user_fk",
      ["created_by_user_id"],
      "user",
      ["id"],
      (constraint) => constraint.onDelete("set null"),
    )
    .execute();

  await sql`
    ALTER TABLE booking
    ADD CONSTRAINT booking_guest_management_token_pair_check
    CHECK (
      (guest_management_token_hash IS NULL) =
      (guest_management_token_encrypted IS NULL)
    ) NOT VALID
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("booking")
    .dropConstraint("booking_guest_management_token_pair_check")
    .execute();
  await db.schema
    .alterTable("booking")
    .dropConstraint("booking_created_by_user_fk")
    .execute();
  await db.schema
    .alterTable("booking")
    .dropColumn("created_by_user_id")
    .execute();
  await db.schema
    .alterTable("booking")
    .dropConstraint("booking_source_check")
    .execute();
  await db.schema.alterTable("booking").dropColumn("source").execute();
  await db.schema
    .alterTable("booking")
    .dropConstraint("booking_guest_name_check")
    .execute();
  await db.schema
    .alterTable("booking")
    .alterColumn("guest_name", (column) => column.setNotNull())
    .execute();
  await db.schema
    .alterTable("booking")
    .addCheckConstraint(
      "booking_guest_name_check",
      sql`guest_name = btrim(guest_name) AND guest_name <> ''`,
    )
    .execute();
}
