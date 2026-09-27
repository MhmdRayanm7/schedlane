import { db } from "../../../db.js";
import { insertOutboxEventInTransaction } from "../../../outbox/persistence.js";
import {
  type OrganizationRequestRejectedPayload,
  organizationRequestEventTypes,
} from "../domain/request-events.js";

type RejectOrganizationRequestInput = {
  requestId: string;
  reviewedByUserId: string;
  reason: string;
};

type RejectOrganizationRequestFailure =
  | "platform_admin_required"
  | "request_not_found"
  | "request_not_pending";

export type RejectOrganizationRequestResult =
  | {
      ok: true;
      request: {
        id: string;
        status: "rejected";
        rejectionReason: string | null;
        decidedAt: string;
      };
    }
  | {
      ok: false;
      reason: RejectOrganizationRequestFailure;
    };

export async function rejectOrganizationRequest(
  input: RejectOrganizationRequestInput,
): Promise<RejectOrganizationRequestResult> {
  return db.transaction().execute(async (trx) => {
    const admin = await trx
      .selectFrom("platform_admin")
      .select("user_id")
      .where("user_id", "=", input.reviewedByUserId)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    if (!admin) {
      return {
        ok: false,
        reason: "platform_admin_required",
      };
    }

    const request = await trx
      .selectFrom("organization_request")
      .select(["id", "status"])
      .where("id", "=", input.requestId)
      .forUpdate()
      .executeTakeFirst();

    if (!request) {
      return {
        ok: false,
        reason: "request_not_found",
      };
    }

    if (request.status !== "pending") {
      return {
        ok: false,
        reason: "request_not_pending",
      };
    }

    const rejectionReason = input.reason.trim();
    const decidedAt = new Date();

    const requestDetails = await trx
      .selectFrom("organization_request")
      .innerJoin("user", "user.id", "organization_request.requested_by_user_id")
      .select([
        "organization_request.name",
        "user.name as applicant_name",
        "user.email as applicant_email",
      ])
      .where("organization_request.id", "=", request.id)
      .executeTakeFirstOrThrow();

    const rejectedRequest = await trx
      .updateTable("organization_request")
      .set({
        status: "rejected",
        reviewed_by_user_id: input.reviewedByUserId,
        organization_id: null,
        rejection_reason: rejectionReason,
        decided_at: decidedAt,
      })
      .where("id", "=", request.id)
      .returning(["id", "status"])
      .executeTakeFirstOrThrow();

    await insertOutboxEventInTransaction<
      typeof organizationRequestEventTypes.rejected,
      OrganizationRequestRejectedPayload
    >(trx, {
      aggregateType: "organization_request",
      aggregateId: request.id,
      eventType: organizationRequestEventTypes.rejected,
      payload: {
        requestId: request.id,
        applicantName: requestDetails.applicant_name,
        applicantEmail: requestDetails.applicant_email,
        organizationName: requestDetails.name,
        rejectionReason,
      },
      occurredAt: decidedAt,
    });

    return {
      ok: true,
      request: {
        id: rejectedRequest.id,
        status: "rejected",
        rejectionReason,
        decidedAt: decidedAt.toISOString(),
      },
    };
  });
}
