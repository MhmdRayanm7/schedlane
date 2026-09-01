import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("organization_invitation")
    .addColumn("id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`uuidv7()`),
    )
    .addColumn("organization_id", "uuid", (column) =>
      column.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("invited_by_user_id", "text", (column) =>
      column.notNull().references("user.id").onDelete("restrict"),
    )
    .addColumn("email", "text", (column) => column.notNull())
    .addColumn("role", "text", (column) => column.notNull())
    .addColumn("token_hash", "text", (column) => column.notNull().unique())
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("accepted_by_user_id", "text", (column) =>
      column.references("user.id").onDelete("restrict"),
    )
    .addColumn("accepted_at", "timestamptz")
    .addColumn("revoked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`current_timestamp`),
    )
    .addCheckConstraint(
      "organization_invitation_email_check",
      sql`email = lower(email) AND email = btrim(email) AND email <> ''`,
    )
    .addCheckConstraint(
      "organization_invitation_role_check",
      sql`role IN ('owner', 'manager', 'staff')`,
    )
    .addCheckConstraint(
      "organization_invitation_token_hash_check",
      sql`token_hash ~ '^[0-9a-f]{64}$'`,
    )
    .addCheckConstraint(
      "organization_invitation_expiry_check",
      sql`expires_at > created_at`,
    )
    .addCheckConstraint(
      "organization_invitation_acceptance_check",
      sql`
        (
          accepted_at IS NULL
          AND accepted_by_user_id IS NULL
        )
        OR
        (
          accepted_at IS NOT NULL
          AND accepted_by_user_id IS NOT NULL
        )
      `,
    )
    .addCheckConstraint(
      "organization_invitation_terminal_state_check",
      sql`NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)`,
    )
    .execute();

  // Only one unresolved invitation may exist for an email in an organization.
  await sql`
    CREATE UNIQUE INDEX organization_invitation_open_email_unique
    ON organization_invitation (organization_id, email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL
  `.execute(db);

  await db.schema
    .createIndex("organization_invitation_organization_id_idx")
    .on("organization_invitation")
    .column("organization_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("organization_invitation").execute();
}
