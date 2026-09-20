import type { Transaction } from "kysely";
import { db } from "../../db.js";
import type { Database } from "../../db-types.js";
import { filterStartsByPublicBookingWindow } from "./public-booking-window.js";
import { resolveResourceServiceFreeSlotContextAfterAccessInTransaction } from "./resource-service-free-slot-resolver.js";

export type ResolvePublicResourceServiceAvailabilityInput = {
  organizationSlug: string;
  resourceId: string;
  serviceId: string;
  date: string;
};

export type ResolvePublicResourceServiceAvailabilityResult =
  | {
      ok: true;
      availability: {
        timezone: "Asia/Jerusalem";
        organizationId: string;
        organizationSlug: string;
        resourceId: string;
        serviceId: string;
        date: string;
        starts: number[];
      };
    }
  | {
      ok: false;
      reason:
        | "public_availability_not_found"
        | "resource_not_found"
        | "service_not_found"
        | "service_not_assigned"
        | "invalid_date"
        | "date_outside_booking_window";
    };

export type ResolvePublicResourceServiceAvailabilityInTransactionResult =
  | {
      ok: true;
      context: {
        timezone: "Asia/Jerusalem";
        organizationId: string;
        organizationSlug: string;
        resourceId: string;
        serviceId: string;
        date: string;
        starts: number[];
        durationMinutes: number;
        bufferAfterMinutes: number;
        pricingEnabled: boolean;
        priceAgorot: number | null;
        cancellationCutoffMinutes: number;
      };
    }
  | Extract<ResolvePublicResourceServiceAvailabilityResult, { ok: false }>;

// The caller owns the transaction and its isolation level.
export async function resolvePublicResourceServiceAvailabilityInTransaction(
  trx: Transaction<Database>,
  input: ResolvePublicResourceServiceAvailabilityInput,
  now: Date,
): Promise<ResolvePublicResourceServiceAvailabilityInTransactionResult> {
  const organization = await trx
    .selectFrom("organization")
    .select([
      "id",
      "slug",
      "published_at",
      "archived_at",
      "suspended_at",
      "public_booking_paused",
      "min_booking_notice_minutes",
      "max_booking_horizon_days",
      "cancellation_cutoff_minutes",
    ])
    .where("slug", "=", input.organizationSlug)
    .executeTakeFirst();
  if (
    !organization?.published_at ||
    organization.archived_at ||
    organization.suspended_at ||
    organization.public_booking_paused
  )
    return { ok: false, reason: "public_availability_not_found" };

  const resource = await trx
    .selectFrom("resource")
    .select("deactivated_at")
    .where("id", "=", input.resourceId)
    .where("organization_id", "=", organization.id)
    .executeTakeFirst();
  if (!resource || resource.deactivated_at)
    return { ok: false, reason: "resource_not_found" };

  const free =
    await resolveResourceServiceFreeSlotContextAfterAccessInTransaction(trx, {
      organizationId: organization.id,
      resourceId: input.resourceId,
      serviceId: input.serviceId,
      date: input.date,
    });
  if (!free.ok) return free;
  if (free.context.serviceDeactivatedAt)
    return { ok: false, reason: "service_not_found" };

  const publicWindow = filterStartsByPublicBookingWindow({
    date: input.date,
    starts: free.context.starts,
    minBookingNoticeMinutes: organization.min_booking_notice_minutes,
    maxBookingHorizonDays: organization.max_booking_horizon_days,
    now,
  });
  if (!publicWindow.ok) {
    const { reason } = publicWindow;
    if (reason === "invalid_public_booking_window")
      throw new Error(
        "Persisted public Booking settings violated domain invariants",
      );
    return { ok: false, reason };
  }

  return {
    ok: true,
    context: {
      timezone: free.context.timezone,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      resourceId: free.context.resourceId,
      serviceId: free.context.serviceId,
      date: free.context.date,
      starts: publicWindow.starts,
      durationMinutes: free.context.durationMinutes,
      bufferAfterMinutes: free.context.bufferAfterMinutes,
      pricingEnabled: free.context.pricingEnabled,
      priceAgorot: free.context.priceAgorot,
      cancellationCutoffMinutes: organization.cancellation_cutoff_minutes,
    },
  };
}

export async function resolvePublicResourceServiceAvailability(
  input: ResolvePublicResourceServiceAvailabilityInput,
  now: Date = new Date(),
): Promise<ResolvePublicResourceServiceAvailabilityResult> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const result =
        await resolvePublicResourceServiceAvailabilityInTransaction(
          trx,
          input,
          now,
        );
      if (!result.ok) return result;

      return {
        ok: true,
        availability: {
          timezone: result.context.timezone,
          organizationId: result.context.organizationId,
          organizationSlug: result.context.organizationSlug,
          resourceId: result.context.resourceId,
          serviceId: result.context.serviceId,
          date: result.context.date,
          starts: result.context.starts,
        },
      };
    });
}
