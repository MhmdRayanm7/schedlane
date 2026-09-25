import { sql, type Transaction } from "kysely";
import type { Database } from "../db-types.js";
import { demoOrganization } from "./demo-organization.js";

export type DemoOwnerBootstrapErrorCode =
  | "invalid_email"
  | "user_not_found"
  | "email_not_verified"
  | "demo_organization_not_found"
  | "demo_organization_identity_conflict"
  | "production_forbidden";

export class DemoOwnerBootstrapError extends Error {
  constructor(
    public readonly code: DemoOwnerBootstrapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DemoOwnerBootstrapError";
  }
}

export function normalizeDemoOwnerEmail(email: string | undefined) {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized || !/^\S+@\S+\.\S+$/.test(normalized)) {
    throw new DemoOwnerBootstrapError(
      "invalid_email",
      "A valid user email argument is required.",
    );
  }

  return normalized;
}

export function assertDemoOwnerBootstrapAllowed(nodeEnv: string | undefined) {
  if (nodeEnv === "production") {
    throw new DemoOwnerBootstrapError(
      "production_forbidden",
      "The demo owner bootstrap cannot run in production.",
    );
  }
}

export async function linkDemoOrganizationOwner(
  trx: Transaction<Database>,
  email: string,
) {
  const normalizedEmail = normalizeDemoOwnerEmail(email);
  const user = await trx
    .selectFrom("user")
    .select(["id", "emailVerified"])
    .where(sql<boolean>`lower("email") = ${normalizedEmail}`)
    .forUpdate()
    .executeTakeFirst();

  if (!user) {
    throw new DemoOwnerBootstrapError(
      "user_not_found",
      `No Better Auth user exists for ${normalizedEmail}. Sign up first.`,
    );
  }

  if (!user.emailVerified) {
    throw new DemoOwnerBootstrapError(
      "email_not_verified",
      `The Better Auth user ${normalizedEmail} must verify their email first.`,
    );
  }

  const matchingOrganizations = await trx
    .selectFrom("organization")
    .select(["id", "slug"])
    .where((expression) =>
      expression.or([
        expression("id", "=", demoOrganization.id),
        expression("slug", "=", demoOrganization.slug),
      ]),
    )
    .forUpdate()
    .execute();

  if (matchingOrganizations.length === 0) {
    throw new DemoOwnerBootstrapError(
      "demo_organization_not_found",
      `The seeded demo Organization (${demoOrganization.slug}) does not exist. Run pnpm db:seed first.`,
    );
  }

  const matchedOrganization = matchingOrganizations[0];
  if (
    matchingOrganizations.length !== 1 ||
    matchedOrganization?.id !== demoOrganization.id ||
    matchedOrganization?.slug !== demoOrganization.slug
  ) {
    throw new DemoOwnerBootstrapError(
      "demo_organization_identity_conflict",
      "The demo Organization ID or slug belongs to a different Organization.",
    );
  }

  await trx
    .insertInto("membership")
    .values({
      organization_id: demoOrganization.id,
      user_id: user.id,
      role: "owner",
    })
    .onConflict((conflict) =>
      conflict.columns(["organization_id", "user_id"]).doUpdateSet({
        role: "owner",
        updated_at: sql`CURRENT_TIMESTAMP`,
      }),
    )
    .execute();

  return { email: normalizedEmail, organization: demoOrganization };
}
