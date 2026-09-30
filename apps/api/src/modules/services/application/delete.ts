import { db } from "../../../db.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";

type DeleteServiceFailure =
  | "organization_not_found"
  | "service_not_found"
  | "insufficient_role"
  | "service_must_be_inactive"
  | "service_has_booking_history"
  | OrganizationWriteStateFailure;

export type DeleteServiceResult =
  | { ok: true }
  | { ok: false; reason: DeleteServiceFailure };

export async function deleteService(input: {
  userId: string;
  organizationId: string;
  serviceId: string;
}): Promise<DeleteServiceResult> {
  return db.transaction().execute(async (trx) => {
    const membership = await trx
      .selectFrom("membership")
      .select("role")
      .where("organization_id", "=", input.organizationId)
      .where("user_id", "=", input.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!membership) return { ok: false, reason: "organization_not_found" };
    if (membership.role === "staff")
      return { ok: false, reason: "insufficient_role" };

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );
    if (!writeState.ok) return writeState;

    const service = await trx
      .selectFrom("service")
      .select(["id", "deactivated_at"])
      .where("organization_id", "=", input.organizationId)
      .where("id", "=", input.serviceId)
      .forUpdate()
      .executeTakeFirst();
    if (!service) return { ok: false, reason: "service_not_found" };
    if (!service.deactivated_at)
      return { ok: false, reason: "service_must_be_inactive" };

    const booking = await trx
      .selectFrom("booking")
      .select("id")
      .where("organization_id", "=", input.organizationId)
      .where("service_id", "=", service.id)
      .limit(1)
      .executeTakeFirst();
    if (booking) return { ok: false, reason: "service_has_booking_history" };

    await trx.deleteFrom("service").where("id", "=", service.id).execute();
    return { ok: true };
  });
}
