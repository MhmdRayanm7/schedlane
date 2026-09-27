import { db } from "../../../db.js";
import { insertOutboxEventInTransaction } from "../../../outbox/persistence.js";
import {
  type OrganizationPublicationRejectedPayload,
  type OrganizationPublishedPayload,
  type OrganizationUnpublishedPayload,
  organizationPublicationEventTypes,
} from "../domain/publication-events.js";
import {
  calculatePublicationReadiness,
  type PublicationReadiness,
} from "./publication-readiness.js";

async function activePlatformAdmin(
  executor: typeof db,
  userId: string,
): Promise<boolean> {
  return Boolean(
    await executor
      .selectFrom("platform_admin")
      .select("user_id")
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .executeTakeFirst(),
  );
}

type PublicationDecisionFailure =
  | "platform_admin_required"
  | "request_not_found"
  | "request_not_pending";

export async function publishOrganization(input: {
  userId: string;
  requestId: string;
}): Promise<
  | {
      ok: true;
      request: { id: string; status: "approved"; reviewedAt: string };
      organization: { id: string; publishedAt: string };
    }
  | {
      ok: false;
      reason:
        | PublicationDecisionFailure
        | "already_published"
        | "readiness_changed";
      readiness?: PublicationReadiness;
    }
> {
  return db.transaction().execute(async (trx) => {
    if (!(await activePlatformAdmin(trx, input.userId)))
      return { ok: false, reason: "platform_admin_required" };

    const request = await trx
      .selectFrom("organization_publication_request")
      .select(["id", "organization_id", "requested_by_user_id", "status"])
      .where("id", "=", input.requestId)
      .forUpdate()
      .executeTakeFirst();
    if (!request) return { ok: false, reason: "request_not_found" };
    if (request.status !== "pending")
      return { ok: false, reason: "request_not_pending" };

    const organization = await trx
      .selectFrom("organization")
      .select(["id", "name", "slug", "published_at"])
      .where("id", "=", request.organization_id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (organization.published_at)
      return { ok: false, reason: "already_published" };

    const readiness = await calculatePublicationReadiness(trx, organization.id);
    if (!readiness?.ready)
      return {
        ok: false,
        reason: "readiness_changed",
        ...(readiness ? { readiness } : {}),
      };

    const requester = await trx
      .selectFrom("user")
      .select(["name", "email"])
      .where("id", "=", request.requested_by_user_id)
      .executeTakeFirstOrThrow();
    const reviewedAt = new Date();
    await trx
      .updateTable("organization")
      .set({ published_at: reviewedAt, updated_at: reviewedAt })
      .where("id", "=", organization.id)
      .executeTakeFirstOrThrow();
    await trx
      .updateTable("organization_publication_request")
      .set({
        status: "approved",
        reviewed_by_user_id: input.userId,
        reviewed_at: reviewedAt,
      })
      .where("id", "=", request.id)
      .executeTakeFirstOrThrow();

    await insertOutboxEventInTransaction<
      typeof organizationPublicationEventTypes.published,
      OrganizationPublishedPayload
    >(trx, {
      aggregateType: "organization_publication_request",
      aggregateId: request.id,
      eventType: organizationPublicationEventTypes.published,
      payload: {
        requestId: request.id,
        recipientName: requester.name,
        recipientEmail: requester.email,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
      },
      occurredAt: reviewedAt,
    });

    return {
      ok: true,
      request: {
        id: request.id,
        status: "approved",
        reviewedAt: reviewedAt.toISOString(),
      },
      organization: {
        id: organization.id,
        publishedAt: reviewedAt.toISOString(),
      },
    };
  });
}

export async function rejectPublicationRequest(input: {
  userId: string;
  requestId: string;
  reason: string;
}): Promise<
  | {
      ok: true;
      request: {
        id: string;
        status: "rejected";
        reviewedAt: string;
        rejectionReason: string;
      };
    }
  | { ok: false; reason: PublicationDecisionFailure }
> {
  return db.transaction().execute(async (trx) => {
    if (!(await activePlatformAdmin(trx, input.userId)))
      return { ok: false, reason: "platform_admin_required" };
    const request = await trx
      .selectFrom("organization_publication_request")
      .select(["id", "organization_id", "requested_by_user_id", "status"])
      .where("id", "=", input.requestId)
      .forUpdate()
      .executeTakeFirst();
    if (!request) return { ok: false, reason: "request_not_found" };
    if (request.status !== "pending")
      return { ok: false, reason: "request_not_pending" };

    const [organization, requester] = await Promise.all([
      trx
        .selectFrom("organization")
        .select(["id", "name", "slug"])
        .where("id", "=", request.organization_id)
        .executeTakeFirstOrThrow(),
      trx
        .selectFrom("user")
        .select(["name", "email"])
        .where("id", "=", request.requested_by_user_id)
        .executeTakeFirstOrThrow(),
    ]);
    const rejectionReason = input.reason.trim();
    const reviewedAt = new Date();
    await trx
      .updateTable("organization_publication_request")
      .set({
        status: "rejected",
        reviewed_by_user_id: input.userId,
        reviewed_at: reviewedAt,
        rejection_reason: rejectionReason,
      })
      .where("id", "=", request.id)
      .executeTakeFirstOrThrow();
    await insertOutboxEventInTransaction<
      typeof organizationPublicationEventTypes.rejected,
      OrganizationPublicationRejectedPayload
    >(trx, {
      aggregateType: "organization_publication_request",
      aggregateId: request.id,
      eventType: organizationPublicationEventTypes.rejected,
      payload: {
        requestId: request.id,
        recipientName: requester.name,
        recipientEmail: requester.email,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        rejectionReason,
      },
      occurredAt: reviewedAt,
    });
    return {
      ok: true,
      request: {
        id: request.id,
        status: "rejected",
        reviewedAt: reviewedAt.toISOString(),
        rejectionReason,
      },
    };
  });
}

export async function unpublishOrganization(input: {
  userId: string;
  organizationId: string;
  reason: string;
}) {
  return db.transaction().execute(async (trx) => {
    if (!(await activePlatformAdmin(trx, input.userId)))
      return { ok: false as const, reason: "platform_admin_required" as const };
    const organization = await trx
      .selectFrom("organization")
      .select(["id", "name", "slug", "published_at"])
      .where("id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!organization)
      return { ok: false as const, reason: "organization_not_found" as const };
    if (!organization.published_at)
      return { ok: false as const, reason: "not_published" as const };

    const recipient =
      (await trx
        .selectFrom("organization_publication_request as request")
        .innerJoin("user", "user.id", "request.requested_by_user_id")
        .select(["user.name", "user.email"])
        .where("request.organization_id", "=", organization.id)
        .where("request.status", "=", "approved")
        .orderBy("request.reviewed_at", "desc")
        .orderBy("request.id", "desc")
        .executeTakeFirst()) ??
      (await trx
        .selectFrom("membership")
        .innerJoin("user", "user.id", "membership.user_id")
        .select(["user.name", "user.email"])
        .where("membership.organization_id", "=", organization.id)
        .where("membership.role", "=", "owner")
        .orderBy("membership.created_at", "asc")
        .executeTakeFirstOrThrow());
    const reason = input.reason.trim();
    const unpublishedAt = new Date();
    const record = await trx
      .insertInto("organization_unpublication")
      .values({
        organization_id: organization.id,
        unpublished_by_user_id: input.userId,
        reason,
        unpublished_at: unpublishedAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx
      .updateTable("organization")
      .set({ published_at: null, updated_at: unpublishedAt })
      .where("id", "=", organization.id)
      .executeTakeFirstOrThrow();
    await insertOutboxEventInTransaction<
      typeof organizationPublicationEventTypes.unpublished,
      OrganizationUnpublishedPayload
    >(trx, {
      aggregateType: "organization",
      aggregateId: organization.id,
      eventType: organizationPublicationEventTypes.unpublished,
      payload: {
        unpublicationId: record.id,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        reason,
      },
      occurredAt: unpublishedAt,
    });
    return {
      ok: true as const,
      organization: { id: organization.id, publishedAt: null },
      unpublication: {
        id: record.id,
        reason,
        unpublishedAt: unpublishedAt.toISOString(),
      },
    };
  });
}
