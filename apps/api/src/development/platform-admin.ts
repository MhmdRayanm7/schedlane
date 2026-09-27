import { sql, type Transaction } from "kysely";
import type { Database } from "../db-types.js";

export class PlatformAdminBootstrapError extends Error {
  constructor(
    public readonly code:
      | "invalid_email"
      | "user_not_found"
      | "production_forbidden",
    message: string,
  ) {
    super(message);
    this.name = "PlatformAdminBootstrapError";
  }
}

export function normalizePlatformAdminEmail(email: string | undefined) {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized || !/^\S+@\S+\.\S+$/.test(normalized)) {
    throw new PlatformAdminBootstrapError(
      "invalid_email",
      "A valid existing user email argument is required.",
    );
  }
  return normalized;
}

export function assertPlatformAdminBootstrapAllowed(
  nodeEnv: string | undefined,
) {
  if (nodeEnv === "production") {
    throw new PlatformAdminBootstrapError(
      "production_forbidden",
      "The local Platform Admin bootstrap cannot run in production.",
    );
  }
}

export async function grantPlatformAdmin(
  trx: Transaction<Database>,
  email: string,
) {
  const normalizedEmail = normalizePlatformAdminEmail(email);
  const user = await trx
    .selectFrom("user")
    .select(["id", "email"])
    .where(sql<boolean>`lower("email") = ${normalizedEmail}`)
    .forUpdate()
    .executeTakeFirst();

  if (!user) {
    throw new PlatformAdminBootstrapError(
      "user_not_found",
      `No Better Auth user exists for ${normalizedEmail}. Sign up first.`,
    );
  }

  await trx
    .insertInto("platform_admin")
    .values({ user_id: user.id, revoked_at: null })
    .onConflict((conflict) =>
      conflict.column("user_id").doUpdateSet({ revoked_at: null }),
    )
    .execute();

  return { userId: user.id, email: user.email };
}
