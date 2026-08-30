import { db } from "../../db.js";
import type { OrganizationRequestStatus } from "../../db-types.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ListOrganizationRequestsInput = {
  userId: string;
  status: OrganizationRequestStatus | undefined;
  limit: number;
  cursor: string | undefined;
};

type OrganizationRequestCursor = {
  createdAt: Date;
  id: string;
  status: OrganizationRequestStatus | null;
};

type ListOrganizationRequestsFailure =
  | "platform_admin_required"
  | "invalid_cursor";

export type ListOrganizationRequestsResult =
  | {
      ok: true;
      items: Array<{
        id: string;
        name: string;
        status: OrganizationRequestStatus;
        requestedBy: {
          id: string;
          name: string;
          email: string;
        };
        organizationId: string | null;
        rejectionReason: string | null;
        createdAt: string;
        decidedAt: string | null;
      }>;
      nextCursor: string | null;
    }
  | {
      ok: false;
      reason: ListOrganizationRequestsFailure;
    };

function isOrganizationRequestStatus(
  value: unknown,
): value is OrganizationRequestStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function encodeCursor(
  createdAt: Date,
  id: string,
  status: OrganizationRequestStatus | undefined,
): string {
  const payload = {
    createdAt: createdAt.toISOString(),
    id,
    status: status ?? null,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor: string): OrganizationRequestCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const value = parsed as Record<string, unknown>;

    if (
      typeof value.createdAt !== "string" ||
      typeof value.id !== "string" ||
      !UUID_PATTERN.test(value.id)
    ) {
      return null;
    }

    if (value.status !== null && !isOrganizationRequestStatus(value.status)) {
      return null;
    }

    const createdAt = new Date(value.createdAt);

    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return {
      createdAt,
      id: value.id,
      status: value.status,
    };
  } catch {
    return null;
  }
}

export async function listOrganizationRequests(
  input: ListOrganizationRequestsInput,
): Promise<ListOrganizationRequestsResult> {
  const admin = await db
    .selectFrom("platform_admin")
    .select("user_id")
    .where("user_id", "=", input.userId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();

  if (!admin) {
    return {
      ok: false,
      reason: "platform_admin_required",
    };
  }

  const cursor = input.cursor ? decodeCursor(input.cursor) : null;

  if (input.cursor && !cursor) {
    return {
      ok: false,
      reason: "invalid_cursor",
    };
  }

  if (cursor && cursor.status !== (input.status ?? null)) {
    return {
      ok: false,
      reason: "invalid_cursor",
    };
  }

  let query = db
    .selectFrom("organization_request")
    .innerJoin("user", "user.id", "organization_request.requested_by_user_id")
    .select([
      "organization_request.id",
      "organization_request.name",
      "organization_request.status",
      "organization_request.organization_id",
      "organization_request.rejection_reason",
      "organization_request.created_at",
      "organization_request.decided_at",
      "organization_request.requested_by_user_id",
      "user.name as requester_name",
      "user.email as requester_email",
    ])
    .orderBy("organization_request.created_at", "desc")
    .orderBy("organization_request.id", "desc")
    .limit(input.limit + 1);

  if (input.status) {
    query = query.where("organization_request.status", "=", input.status);
  }

  if (cursor) {
    query = query.where((eb) =>
      eb.or([
        eb("organization_request.created_at", "<", cursor.createdAt),
        eb.and([
          eb("organization_request.created_at", "=", cursor.createdAt),
          eb("organization_request.id", "<", cursor.id),
        ]),
      ]),
    );
  }

  const rows = await query.execute();

  const hasMore = rows.length > input.limit;
  const pageRows = rows.slice(0, input.limit);

  const lastRow = pageRows.at(-1);

  const nextCursor =
    hasMore && lastRow
      ? encodeCursor(lastRow.created_at, lastRow.id, input.status)
      : null;

  return {
    ok: true,
    items: pageRows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      requestedBy: {
        id: row.requested_by_user_id,
        name: row.requester_name,
        email: row.requester_email,
      },
      organizationId: row.organization_id,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
    })),
    nextCursor,
  };
}
