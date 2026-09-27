import { sql } from "kysely";
import { db } from "../../../db.js";
import type { OrganizationRequestStatus } from "../../../db-types.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;

type ListOrganizationRequestsInput = {
  userId: string;
  status: OrganizationRequestStatus | undefined;
  limit: number;
  cursor: string | undefined;
};

type OrganizationRequestCursor = {
  createdAt: string;
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
        description: string | null;
        contactPhone: string | null;
        additionalContext: string | null;
        wantsSetupHelp: boolean;
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
  createdAt: string,
  id: string,
  status: OrganizationRequestStatus | undefined,
): string {
  const payload = {
    createdAt,
    id,
    status: status ?? null,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function isCursorTimestamp(value: string): boolean {
  const match = CURSOR_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }

  const daysInMonth = [
    31,
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const maxDay = daysInMonth[month - 1];
  return maxDay !== undefined && day >= 1 && day <= maxDay;
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
      !isCursorTimestamp(value.createdAt) ||
      typeof value.id !== "string" ||
      !UUID_PATTERN.test(value.id)
    ) {
      return null;
    }

    if (value.status !== null && !isOrganizationRequestStatus(value.status)) {
      return null;
    }

    return {
      createdAt: value.createdAt,
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
      "organization_request.description",
      "organization_request.contact_phone",
      "organization_request.additional_context",
      "organization_request.wants_setup_help",
      "organization_request.status",
      "organization_request.organization_id",
      "organization_request.rejection_reason",
      "organization_request.created_at",
      sql<string>`to_char(organization_request.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        "created_at_cursor",
      ),
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
    query = query.where(
      sql<boolean>`organization_request.created_at < ${cursor.createdAt}::timestamptz
        OR (
          organization_request.created_at = ${cursor.createdAt}::timestamptz
          AND organization_request.id < ${cursor.id}::uuid
        )`,
    );
  }

  const rows = await query.execute();

  const hasMore = rows.length > input.limit;
  const pageRows = rows.slice(0, input.limit);

  const lastRow = pageRows.at(-1);

  const nextCursor =
    hasMore && lastRow
      ? encodeCursor(lastRow.created_at_cursor, lastRow.id, input.status)
      : null;

  return {
    ok: true,
    items: pageRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      contactPhone: row.contact_phone,
      additionalContext: row.additional_context,
      wantsSetupHelp: row.wants_setup_help,
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

export async function getApplicantOrganizationRequest(userId: string) {
  const row = await db
    .selectFrom("organization_request")
    .select([
      "id",
      "name",
      "description",
      "contact_phone",
      "additional_context",
      "wants_setup_help",
      "status",
      "organization_id",
      "rejection_reason",
      "created_at",
      "decided_at",
    ])
    .where("requested_by_user_id", "=", userId)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();

  if (!row) return { request: null };

  return {
    request: {
      id: row.id,
      name: row.name,
      description: row.description,
      contactPhone: row.contact_phone,
      additionalContext: row.additional_context,
      wantsSetupHelp: row.wants_setup_help,
      status: row.status,
      organizationId: row.organization_id,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
    },
  };
}

export type GetPlatformOrganizationRequestResult =
  | {
      ok: true;
      request: {
        id: string;
        name: string;
        description: string | null;
        contactPhone: string | null;
        additionalContext: string | null;
        wantsSetupHelp: boolean;
        status: OrganizationRequestStatus;
        requestedBy: { id: string; name: string; email: string };
        reviewedBy: { id: string; name: string; email: string } | null;
        organizationId: string | null;
        rejectionReason: string | null;
        createdAt: string;
        decidedAt: string | null;
      };
    }
  | { ok: false; reason: "platform_admin_required" | "request_not_found" };

export async function getPlatformOrganizationRequest(input: {
  userId: string;
  requestId: string;
}): Promise<GetPlatformOrganizationRequestResult> {
  const admin = await db
    .selectFrom("platform_admin")
    .select("user_id")
    .where("user_id", "=", input.userId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();

  if (!admin) return { ok: false, reason: "platform_admin_required" };

  const row = await db
    .selectFrom("organization_request")
    .innerJoin(
      "user as applicant",
      "applicant.id",
      "organization_request.requested_by_user_id",
    )
    .leftJoin(
      "user as reviewer",
      "reviewer.id",
      "organization_request.reviewed_by_user_id",
    )
    .select([
      "organization_request.id",
      "organization_request.name",
      "organization_request.description",
      "organization_request.contact_phone",
      "organization_request.additional_context",
      "organization_request.wants_setup_help",
      "organization_request.status",
      "organization_request.requested_by_user_id",
      "organization_request.reviewed_by_user_id",
      "organization_request.organization_id",
      "organization_request.rejection_reason",
      "organization_request.created_at",
      "organization_request.decided_at",
      "applicant.name as applicant_name",
      "applicant.email as applicant_email",
      "reviewer.name as reviewer_name",
      "reviewer.email as reviewer_email",
    ])
    .where("organization_request.id", "=", input.requestId)
    .executeTakeFirst();

  if (!row) return { ok: false, reason: "request_not_found" };

  return {
    ok: true,
    request: {
      id: row.id,
      name: row.name,
      description: row.description,
      contactPhone: row.contact_phone,
      additionalContext: row.additional_context,
      wantsSetupHelp: row.wants_setup_help,
      status: row.status,
      requestedBy: {
        id: row.requested_by_user_id,
        name: row.applicant_name,
        email: row.applicant_email,
      },
      reviewedBy:
        row.reviewed_by_user_id && row.reviewer_name && row.reviewer_email
          ? {
              id: row.reviewed_by_user_id,
              name: row.reviewer_name,
              email: row.reviewer_email,
            }
          : null,
      organizationId: row.organization_id,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
    },
  };
}
