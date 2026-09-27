import { db } from "../../../db.js";
import type { OrganizationPublicationRequestStatus } from "../../../db-types.js";
import { calculatePublicationReadiness } from "./publication-readiness.js";

async function requirePlatformAdmin(userId: string) {
  return Boolean(
    await db
      .selectFrom("platform_admin")
      .select("user_id")
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .executeTakeFirst(),
  );
}

export async function listPublicationRequests(input: {
  userId: string;
  status?: OrganizationPublicationRequestStatus | undefined;
  limit: number;
}) {
  if (!(await requirePlatformAdmin(input.userId)))
    return { ok: false as const, reason: "platform_admin_required" as const };

  let query = db
    .selectFrom("organization_publication_request as request")
    .innerJoin("organization", "organization.id", "request.organization_id")
    .innerJoin("user", "user.id", "request.requested_by_user_id")
    .select([
      "request.id",
      "request.organization_id",
      "request.status",
      "request.requested_at",
      "request.reviewed_at",
      "request.rejection_reason",
      "organization.name as organization_name",
      "organization.slug",
      "organization.published_at",
      "user.name as requester_name",
      "user.email as requester_email",
    ])
    .orderBy("request.requested_at", "desc")
    .orderBy("request.id", "desc")
    .limit(input.limit);
  if (input.status) query = query.where("request.status", "=", input.status);
  const rows = await query.execute();
  const items = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      slug: row.slug,
      requester: { name: row.requester_name, email: row.requester_email },
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      rejectionReason: row.rejection_reason,
      publishedAt: row.published_at?.toISOString() ?? null,
      readiness: await calculatePublicationReadiness(db, row.organization_id),
    })),
  );
  return { ok: true as const, items };
}

export async function getPlatformPublicationRequest(input: {
  userId: string;
  requestId: string;
}) {
  if (!(await requirePlatformAdmin(input.userId)))
    return { ok: false as const, reason: "platform_admin_required" as const };
  const row = await db
    .selectFrom("organization_publication_request as request")
    .innerJoin("organization", "organization.id", "request.organization_id")
    .innerJoin("user", "user.id", "request.requested_by_user_id")
    .select([
      "request.id",
      "request.organization_id",
      "request.status",
      "request.requested_at",
      "request.reviewed_at",
      "request.rejection_reason",
      "organization.name as organization_name",
      "organization.slug",
      "organization.published_at",
      "organization.public_booking_paused",
      "organization.suspended_at",
      "organization.archived_at",
      "organization.pricing_enabled",
      "user.name as requester_name",
      "user.email as requester_email",
    ])
    .where("request.id", "=", input.requestId)
    .executeTakeFirst();
  if (!row) return { ok: false as const, reason: "request_not_found" as const };
  const readiness = await calculatePublicationReadiness(
    db,
    row.organization_id,
  );
  return {
    ok: true as const,
    request: {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      slug: row.slug,
      requester: { name: row.requester_name, email: row.requester_email },
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      rejectionReason: row.rejection_reason,
      publishedAt: row.published_at?.toISOString() ?? null,
      publicBookingPaused: row.public_booking_paused,
      suspendedAt: row.suspended_at?.toISOString() ?? null,
      archivedAt: row.archived_at?.toISOString() ?? null,
      pricingEnabled: row.pricing_enabled,
      readiness,
    },
  };
}
