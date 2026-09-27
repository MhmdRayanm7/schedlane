import { sql } from "kysely";
import { db } from "../../../db.js";

export async function getPlatformAdminIdentity(userId: string) {
  const row = await db
    .selectFrom("platform_admin")
    .innerJoin("user", "user.id", "platform_admin.user_id")
    .select(["user.id", "user.name", "user.email"])
    .where("platform_admin.user_id", "=", userId)
    .where("platform_admin.revoked_at", "is", null)
    .executeTakeFirst();

  return row
    ? {
        ok: true as const,
        admin: { id: row.id, name: row.name, email: row.email },
      }
    : { ok: false as const, reason: "platform_admin_required" as const };
}

type OrganizationCursor = { createdAt: string; id: string };
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function decodeCursor(value: string): OrganizationCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object") return null;
    const cursor = parsed as Record<string, unknown>;
    if (
      typeof cursor.createdAt !== "string" ||
      !CURSOR_TIMESTAMP_PATTERN.test(cursor.createdAt) ||
      typeof cursor.id !== "string" ||
      !UUID_PATTERN.test(cursor.id)
    ) {
      return null;
    }
    return { createdAt: cursor.createdAt, id: cursor.id };
  } catch {
    return null;
  }
}

export async function listPlatformOrganizations(input: {
  userId: string;
  limit: number;
  cursor?: string | undefined;
}) {
  const admin = await db
    .selectFrom("platform_admin")
    .select("user_id")
    .where("user_id", "=", input.userId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  if (!admin)
    return { ok: false as const, reason: "platform_admin_required" as const };

  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  if (input.cursor && !cursor) {
    return { ok: false as const, reason: "invalid_cursor" as const };
  }

  let query = db
    .selectFrom("organization")
    .select([
      "organization.id",
      "organization.name",
      "organization.slug",
      "organization.published_at",
      "organization.public_booking_paused",
      "organization.suspended_at",
      "organization.archived_at",
      "organization.created_at",
      sql<string>`to_char(organization.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        "created_at_cursor",
      ),
      sql<string | null>`(
        SELECT u.name FROM membership m
        JOIN "user" u ON u.id = m.user_id
        WHERE m.organization_id = organization.id AND m.role = 'owner'
        ORDER BY m.created_at, m.id LIMIT 1
      )`.as("owner_name"),
      sql<string | null>`(
        SELECT u.email FROM membership m
        JOIN "user" u ON u.id = m.user_id
        WHERE m.organization_id = organization.id AND m.role = 'owner'
        ORDER BY m.created_at, m.id LIMIT 1
      )`.as("owner_email"),
      sql<string | null>`(
        SELECT publication_request.id
        FROM organization_publication_request publication_request
        WHERE publication_request.organization_id = organization.id
          AND publication_request.status = 'pending'
        LIMIT 1
      )`.as("pending_publication_request_id"),
    ])
    .orderBy("organization.created_at", "desc")
    .orderBy("organization.id", "desc")
    .limit(input.limit + 1);

  if (cursor) {
    query = query.where(
      sql<boolean>`organization.created_at < ${cursor.createdAt}::timestamptz
        OR (organization.created_at = ${cursor.createdAt}::timestamptz
          AND organization.id < ${cursor.id}::uuid)`,
    );
  }

  const rows = await query.execute();
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > input.limit && last
      ? Buffer.from(
          JSON.stringify({
            createdAt: last.created_at_cursor,
            id: last.id,
          }),
        ).toString("base64url")
      : null;

  return {
    ok: true as const,
    items: page.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      owner:
        row.owner_name && row.owner_email
          ? { name: row.owner_name, email: row.owner_email }
          : null,
      publishedAt: row.published_at?.toISOString() ?? null,
      publicBookingPaused: row.public_booking_paused,
      suspendedAt: row.suspended_at?.toISOString() ?? null,
      archivedAt: row.archived_at?.toISOString() ?? null,
      pendingPublicationRequestId: row.pending_publication_request_id,
      createdAt: row.created_at.toISOString(),
    })),
    nextCursor,
  };
}
