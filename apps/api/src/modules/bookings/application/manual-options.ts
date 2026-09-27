import { db } from "../../../db.js";
import { isLocalDate } from "../../availability/domain/local-date.js";
import { resolveResourceServiceFreeSlotContextAfterAccessInTransaction } from "../../availability/resolvers/resource-service-free-slots.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";
import { cloneValidOperationTime } from "../domain/operation-time.js";
import { canManageBookingForResource } from "../domain/policy.js";
import { localBookingStartToUtc, SCHEDULING_TIMEZONE } from "../domain/time.js";

export type GetManualBookingOptionsResult =
  | {
      ok: true;
      options: {
        timezone: typeof SCHEDULING_TIMEZONE;
        resourceId: string;
        serviceId: string;
        date: string;
        starts: number[];
      };
    }
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | OrganizationWriteStateFailure
        | "resource_not_found"
        | "insufficient_role"
        | "resource_inactive"
        | "service_not_found"
        | "service_inactive"
        | "service_not_assigned"
        | "invalid_date";
    };

export async function getManualBookingOptions(
  input: {
    userId: string;
    organizationId: string;
    resourceId: string;
    serviceId: string;
    date: string;
  },
  now: Date = new Date(),
): Promise<GetManualBookingOptionsResult> {
  const operationNow = cloneValidOperationTime(
    now,
    "Manual Booking options now must be a valid Date",
  );
  if (!isLocalDate(input.date)) return { ok: false, reason: "invalid_date" };

  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const membership = await trx
        .selectFrom("membership")
        .select("role")
        .where("organization_id", "=", input.organizationId)
        .where("user_id", "=", input.userId)
        .executeTakeFirst();
      if (!membership) return { ok: false, reason: "organization_not_found" };

      const resource = await trx
        .selectFrom("resource")
        .select(["id", "user_id", "deactivated_at"])
        .where("id", "=", input.resourceId)
        .where("organization_id", "=", input.organizationId)
        .executeTakeFirst();
      if (!resource) return { ok: false, reason: "resource_not_found" };
      if (
        !canManageBookingForResource(
          { userId: input.userId, role: membership.role },
          resource.user_id,
        )
      )
        return { ok: false, reason: "insufficient_role" };

      const writeState = await requireWritableOrganization(
        trx,
        input.organizationId,
      );
      if (!writeState.ok) return writeState;
      if (resource.deactivated_at)
        return { ok: false, reason: "resource_inactive" };

      const resolved =
        await resolveResourceServiceFreeSlotContextAfterAccessInTransaction(
          trx,
          {
            organizationId: input.organizationId,
            resourceId: resource.id,
            serviceId: input.serviceId,
            date: input.date,
          },
        );
      if (!resolved.ok) return resolved;
      if (resolved.context.serviceDeactivatedAt)
        return { ok: false, reason: "service_inactive" };

      return {
        ok: true,
        options: {
          timezone: SCHEDULING_TIMEZONE,
          resourceId: resource.id,
          serviceId: resolved.context.serviceId,
          date: input.date,
          starts: resolved.context.starts.filter((startMinute) => {
            const startAt = localBookingStartToUtc(input.date, startMinute);
            return (
              startAt !== null && startAt.getTime() >= operationNow.getTime()
            );
          }),
        },
      };
    });
}
