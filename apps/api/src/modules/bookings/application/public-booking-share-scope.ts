import type { Transaction } from "kysely";
import type { Database } from "../../../db-types.js";
import type { BookingShareScope } from "./booking-share-links.js";

export type ResolvePublicBookingShareScopeResult =
  | { ok: true; scope: BookingShareScope | null }
  | { ok: false; reason: "public_booking_share_not_found" };

export async function resolvePublicBookingShareScopeInTransaction(
  trx: Transaction<Database>,
  input: { organizationId: string; token?: string; lock?: boolean },
): Promise<ResolvePublicBookingShareScopeResult> {
  if (input.token === undefined) return { ok: true, scope: null };
  if (!input.token)
    return { ok: false, reason: "public_booking_share_not_found" };

  let query = trx
    .selectFrom("booking_share_link")
    .select(["service_id", "resource_id", "revoked_at"])
    .where("organization_id", "=", input.organizationId)
    .where("token", "=", input.token);
  if (input.lock) query = query.forShare();
  const link = await query.executeTakeFirst();
  if (!link || link.revoked_at)
    return { ok: false, reason: "public_booking_share_not_found" };

  if (link.service_id) {
    const service = await trx
      .selectFrom("service")
      .select("deactivated_at")
      .where("id", "=", link.service_id)
      .where("organization_id", "=", input.organizationId)
      .executeTakeFirst();
    if (!service || service.deactivated_at)
      return { ok: false, reason: "public_booking_share_not_found" };
  }
  if (link.resource_id) {
    const resource = await trx
      .selectFrom("resource")
      .select("deactivated_at")
      .where("id", "=", link.resource_id)
      .where("organization_id", "=", input.organizationId)
      .executeTakeFirst();
    if (!resource || resource.deactivated_at)
      return { ok: false, reason: "public_booking_share_not_found" };
  }

  const assignment = await trx
    .selectFrom("resource_service as assignment")
    .innerJoin("service", "service.id", "assignment.service_id")
    .innerJoin("resource", "resource.id", "assignment.resource_id")
    .select("assignment.service_id")
    .where("assignment.organization_id", "=", input.organizationId)
    .$if(Boolean(link.service_id), (builder) =>
      builder.where("assignment.service_id", "=", link.service_id ?? ""),
    )
    .$if(Boolean(link.resource_id), (builder) =>
      builder.where("assignment.resource_id", "=", link.resource_id ?? ""),
    )
    .where("service.deactivated_at", "is", null)
    .where("resource.deactivated_at", "is", null)
    .executeTakeFirst();
  if (!assignment)
    return { ok: false, reason: "public_booking_share_not_found" };

  return {
    ok: true,
    scope: { serviceId: link.service_id, resourceId: link.resource_id },
  };
}

export function selectionAllowedByShareScope(
  scope: BookingShareScope | null,
  selection: { serviceId: string; resourceId: string },
): boolean {
  if (!scope) return true;
  return (
    (!scope.serviceId || scope.serviceId === selection.serviceId) &&
    (!scope.resourceId || scope.resourceId === selection.resourceId)
  );
}
