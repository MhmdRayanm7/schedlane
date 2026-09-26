import type { Transaction } from "kysely";
import { DateTime } from "luxon";
import { db } from "../../../db.js";
import type { Database } from "../../../db-types.js";
import { isLocalDate } from "../domain/local-date.js";
import {
  filterStartsByPublicBookingWindow,
  publicBookingDateWindow,
} from "../domain/public-booking-window.js";
import { resolveResourceServiceFreeSlotContextAfterAccessInTransaction } from "./resource-service-free-slots.js";

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

type PublicAccess = {
  id: string;
  slug: string;
  min_booking_notice_minutes: number;
  max_booking_horizon_days: number;
  cancellation_cutoff_minutes: number;
};

async function loadPublicAccess(
  trx: Transaction<Database>,
  input: Pick<
    ResolvePublicResourceServiceAvailabilityInput,
    "organizationSlug" | "resourceId"
  >,
): Promise<
  | { ok: true; organization: PublicAccess }
  | {
      ok: false;
      reason: "public_availability_not_found" | "resource_not_found";
    }
> {
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
  return { ok: true, organization };
}

async function resolveForDate(
  trx: Transaction<Database>,
  input: ResolvePublicResourceServiceAvailabilityInput,
  organization: PublicAccess,
  now: Date,
): Promise<ResolvePublicResourceServiceAvailabilityInTransactionResult> {
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
    if (publicWindow.reason === "invalid_public_booking_window")
      throw new Error(
        "Persisted public Booking settings violated domain invariants",
      );
    return { ok: false, reason: publicWindow.reason };
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

// The caller owns the transaction and its isolation level.
export async function resolvePublicResourceServiceAvailabilityInTransaction(
  trx: Transaction<Database>,
  input: ResolvePublicResourceServiceAvailabilityInput,
  now: Date,
): Promise<ResolvePublicResourceServiceAvailabilityInTransactionResult> {
  const access = await loadPublicAccess(trx, input);
  if (!access.ok) return access;
  return resolveForDate(trx, input, access.organization, now);
}

export async function resolveNextPublicResourceServiceAvailability(
  input: Omit<ResolvePublicResourceServiceAvailabilityInput, "date"> & {
    fromDate: string;
  },
  now: Date = new Date(),
): Promise<
  | ResolvePublicResourceServiceAvailabilityResult
  | { ok: true; availability: null }
> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const access = await loadPublicAccess(trx, input);
      if (!access.ok) return access;
      if (!isLocalDate(input.fromDate))
        return { ok: false, reason: "invalid_date" };
      const window = publicBookingDateWindow(
        now,
        access.organization.max_booking_horizon_days,
      );
      if (input.fromDate < window.firstDate || input.fromDate > window.lastDate)
        return { ok: false, reason: "date_outside_booking_window" };
      let date = input.fromDate;
      while (date <= window.lastDate) {
        const result = await resolveForDate(
          trx,
          { ...input, date },
          access.organization,
          now,
        );
        if (!result.ok) return result;
        if (result.context.starts.length > 0)
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
        const nextDate = DateTime.fromISO(date, { zone: "Asia/Jerusalem" })
          .plus({ days: 1 })
          .toISODate();
        if (!nextDate) throw new Error("Public Booking date iteration failed");
        date = nextDate;
      }
      return { ok: true, availability: null };
    });
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
