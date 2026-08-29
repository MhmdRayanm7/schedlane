import { db } from "../../db.js";

type ApproveOrganizationRequestInput = {
  requestId: string;
  reviewedByUserId: string;
  slug: string;
};

type ApproveOrganizationRequestFailure =
  | "platform_admin_required"
  | "request_not_found"
  | "request_not_pending"
  | "slug_taken";

export type ApproveOrganizationRequestResult =
  | {
      ok: true;
      organization: {
        id: string;
        slug: string;
        name: string;
        createdAt: string;
      };
      request: {
        id: string;
        status: "approved";
        decidedAt: string;
      };
    }
  | {
      ok: false;
      reason: ApproveOrganizationRequestFailure;
    };

export async function approveOrganizationRequest(
  input: ApproveOrganizationRequestInput,
): Promise<ApproveOrganizationRequestResult> {
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
      .select(["id", "requested_by_user_id", "name", "status"])
      .where("id", "=", input.requestId)
      .forUpdate() //concurrency correctness
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

    const organization = await trx
      .insertInto("organization")
      .values({
        name: request.name,
        slug: input.slug,
      })
      .onConflict((conflict) => conflict.column("slug").doNothing())
      .returning(["id", "slug", "name", "created_at"])
      .executeTakeFirst();

    if (!organization) {
      return {
        ok: false,
        reason: "slug_taken",
      };
    }

    await trx
      .insertInto("membership")
      .values({
        organization_id: organization.id,
        user_id: request.requested_by_user_id,
        role: "owner",
      })
      .execute();

    const decidedAt = new Date();

    const approvedRequest = await trx
      .updateTable("organization_request")
      .set({
        status: "approved",
        reviewed_by_user_id: input.reviewedByUserId,
        organization_id: organization.id,
        rejection_reason: null,
        decided_at: decidedAt,
      })
      .where("id", "=", request.id)
      .returning(["id", "status"])
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        createdAt: organization.created_at.toISOString(),
      },
      request: {
        id: approvedRequest.id,
        status: "approved",
        decidedAt: decidedAt.toISOString(),
      },
    };
  });
}
