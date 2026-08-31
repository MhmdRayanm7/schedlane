import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .addColumn("staff_team_visibility", "text", (column) =>
      column.notNull().defaultTo("team"),
    )
    .execute();

  await db.schema
    .alterTable("organization")
    .addCheckConstraint(
      "organization_staff_team_visibility_check",
      sql`staff_team_visibility IN ('team', 'self')`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organization")
    .dropConstraint("organization_staff_team_visibility_check")
    .execute();

  await db.schema
    .alterTable("organization")
    .dropColumn("staff_team_visibility")
    .execute();
}
