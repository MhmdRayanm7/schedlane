import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization_request")
    .addColumn("description", "text")
    .addColumn("contact_phone", "text")
    .addColumn("additional_context", "text")
    .addColumn("wants_setup_help", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();

  await db.schema
    .alterTable("organization_request")
    .addCheckConstraint(
      "organization_request_description_length",
      sql`description is null or (length(trim(description)) between 10 and 2000)`,
    )
    .execute();
  await db.schema
    .alterTable("organization_request")
    .addCheckConstraint(
      "organization_request_contact_phone_length",
      sql`contact_phone is null or length(contact_phone) <= 80`,
    )
    .execute();
  await db.schema
    .alterTable("organization_request")
    .addCheckConstraint(
      "organization_request_additional_context_length",
      sql`additional_context is null or length(additional_context) <= 2000`,
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX organization_request_one_pending_per_user_idx
    ON organization_request (requested_by_user_id)
    WHERE status = 'pending'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("organization_request_one_pending_per_user_idx")
    .execute();

  await db.schema
    .alterTable("organization_request")
    .dropConstraint("organization_request_additional_context_length")
    .execute();
  await db.schema
    .alterTable("organization_request")
    .dropConstraint("organization_request_contact_phone_length")
    .execute();
  await db.schema
    .alterTable("organization_request")
    .dropConstraint("organization_request_description_length")
    .execute();
  await db.schema
    .alterTable("organization_request")
    .dropColumn("wants_setup_help")
    .dropColumn("additional_context")
    .dropColumn("contact_phone")
    .dropColumn("description")
    .execute();
}
