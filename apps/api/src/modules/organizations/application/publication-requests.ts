import { db } from "../../../db.js";
import { insertOutboxEventInTransaction } from "../../../outbox/persistence.js";
import {
  type OrganizationPublicationRequestedPayload,
  organizationPublicationEventTypes,
} from "../domain/publication-events.js";
import {
  calculatePublicationReadiness,
  type PublicationReadiness,
} from "./publication-readiness.js";

export async function getOrganizationPublicationStatus(input: {
  userId: string;
  organizationId: string;
}) {
  const membership = await db
    .selectFrom("membership")
    .select("role")
    .where("organization_id", "=", input.organizationId)
    .where("user_id", "=", input.userId)
    .executeTakeFirst();
  if (!membership)
    return { ok: false as const, reason: "organization_not_found" as const };
  if (membership.role === "staff")
    return { ok: false as const, reason: "insufficient_role" as const };

  const organization = await db
    .selectFrom("organization")
    .select(["published_at", "public_booking_paused"])
    .where("id", "=", input.organizationId)
    .executeTakeFirstOrThrow();
  const request = await db
    .selectFrom("organization_publication_request")
    .select(["id", "status", "requested_at", "reviewed_at", "rejection_reason"])
    .where("organization_id", "=", input.organizationId)
    .orderBy("requested_at", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();

  return {
    ok: true as const,
    status: {
      publishedAt: organization.published_at?.toISOString() ?? null,
      publicBookingPaused: organization.public_booking_paused,
      latestRequest: request
        ? {
            id: request.id,
            status: request.status,
            requestedAt: request.requested_at.toISOString(),
            reviewedAt: request.reviewed_at?.toISOString() ?? null,
            rejectionReason: request.rejection_reason,
          }
        : null,
    },
  };
}

type CreatePublicationRequestFailure =
  | "organization_not_found"
  | "owner_required"
  | "already_published"
  | "organization_archived"
  | "organization_suspended"
  | "pending_request_exists"
  | "not_ready";

export type CreatePublicationRequestResult =
  | {
      ok: true;
      request: { id: string; status: "pending"; requestedAt: string };
    }
  | {
      ok: false;
      reason: CreatePublicationRequestFailure;
      readiness?: PublicationReadiness;
    };

export async function createPublicationRequest(input: {
  userId: string;
  organizationId: string;
}): Promise<CreatePublicationRequestResult> {
  return db.transaction().execute(async (trx) => {
    const membership = await trx
      .selectFrom("membership")
      .select("role")
      .where("organization_id", "=", input.organizationId)
      .where("user_id", "=", input.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!membership) return { ok: false, reason: "organization_not_found" };
    if (membership.role !== "owner")
      return { ok: false, reason: "owner_required" };

    const organization = await trx
      .selectFrom("organization")
      .select([
        "id",
        "name",
        "slug",
        "published_at",
        "archived_at",
        "suspended_at",
      ])
      .where("id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (organization.published_at)
      return { ok: false, reason: "already_published" };
    if (organization.archived_at)
      return { ok: false, reason: "organization_archived" };
    if (organization.suspended_at)
      return { ok: false, reason: "organization_suspended" };

    const pending = await trx
      .selectFrom("organization_publication_request")
      .select("id")
      .where("organization_id", "=", organization.id)
      .where("status", "=", "pending")
      .executeTakeFirst();
    if (pending) return { ok: false, reason: "pending_request_exists" };

    const readiness = await calculatePublicationReadiness(trx, organization.id);
    if (!readiness) return { ok: false, reason: "organization_not_found" };
    if (!readiness.ready) return { ok: false, reason: "not_ready", readiness };

    const requester = await trx
      .selectFrom("user")
      .select(["name", "email"])
      .where("id", "=", input.userId)
      .executeTakeFirstOrThrow();
    const request = await trx
      .insertInto("organization_publication_request")
      .values({
        organization_id: organization.id,
        requested_by_user_id: input.userId,
      })
      .returning(["id", "status", "requested_at"])
      .executeTakeFirstOrThrow();

    await insertOutboxEventInTransaction<
      typeof organizationPublicationEventTypes.requested,
      OrganizationPublicationRequestedPayload
    >(trx, {
      aggregateType: "organization_publication_request",
      aggregateId: request.id,
      eventType: organizationPublicationEventTypes.requested,
      payload: {
        requestId: request.id,
        recipientName: requester.name,
        recipientEmail: requester.email,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
      },
      occurredAt: request.requested_at,
    });

    return {
      ok: true,
      request: {
        id: request.id,
        status: "pending",
        requestedAt: request.requested_at.toISOString(),
      },
    };
  });
}
