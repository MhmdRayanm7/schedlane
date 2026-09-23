import type { Transaction } from "kysely";
import { db } from "../../../db.js";
import type { Database } from "../../../db-types.js";
import { insertOutboxEventInTransaction } from "../../../outbox/persistence.js";
import { isLocalDate } from "../../availability/domain/local-date.js";
import { resolveResourceServiceSlotContextAfterAccessInTransaction } from "../../availability/resolvers/resource-service-slots.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";
import {
  bookingEventType,
  createBookingCreatedEventPayload,
} from "../domain/events.js";
import {
  normalizeGuestEmail,
  normalizeGuestName,
  normalizeOptionalIsraeliGuestPhone,
} from "../domain/guest-contact.js";
import { cloneValidOperationTime } from "../domain/operation-time.js";
import { canManageBookingForResource } from "../domain/policy.js";
import { localBookingStartToUtc } from "../domain/time.js";
import {
  type ConfirmedBooking,
  insertConfirmedBookingInTransaction,
  runConfirmedBookingWriteWithRetries,
} from "../persistence/confirmed-booking-write.js";

export type CreateManualBookingInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
  serviceId: string;
  date: string;
  startMinute: number;
  guestName: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  customerNote?: string | null;
};

type CreateManualBookingFailure =
  | "organization_not_found"
  | "resource_not_found"
  | "insufficient_role"
  | OrganizationWriteStateFailure
  | "resource_inactive"
  | "service_not_found"
  | "service_inactive"
  | "service_not_assigned"
  | "invalid_date"
  | "invalid_start_time"
  | "invalid_guest_name"
  | "invalid_guest_phone"
  | "start_not_available"
  | "booking_conflict";

export type CreateManualBookingResult =
  | {
      ok: true;
      booking: ConfirmedBooking;
    }
  | { ok: false; reason: CreateManualBookingFailure };

type NormalizedManualBookingInput = Omit<
  CreateManualBookingInput,
  "guestName" | "guestPhone" | "guestEmail" | "customerNote"
> & {
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  customerNote: string | null;
  startAt: Date;
};

async function executeManualBookingTransaction(
  input: NormalizedManualBookingInput,
  publicReference: string,
  now: Date,
): Promise<CreateManualBookingResult> {
  return db
    .transaction()
    .setIsolationLevel("serializable")
    .execute((trx) =>
      createManualBookingInTransaction(trx, input, publicReference, now),
    );
}

async function createManualBookingInTransaction(
  trx: Transaction<Database>,
  input: NormalizedManualBookingInput,
  publicReference: string,
  now: Date,
): Promise<CreateManualBookingResult> {
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
  const organization = await trx
    .selectFrom("organization")
    .select("cancellation_cutoff_minutes")
    .where("id", "=", input.organizationId)
    .executeTakeFirstOrThrow();
  if (resource.deactivated_at)
    return { ok: false, reason: "resource_inactive" };

  const slots = await resolveResourceServiceSlotContextAfterAccessInTransaction(
    trx,
    {
      organizationId: input.organizationId,
      resourceId: resource.id,
      serviceId: input.serviceId,
      date: input.date,
    },
  );
  if (!slots.ok) return slots;
  if (slots.context.serviceDeactivatedAt)
    return { ok: false, reason: "service_inactive" };
  if (!slots.context.starts.includes(input.startMinute))
    return { ok: false, reason: "start_not_available" };

  const priceAgorot = slots.context.pricingEnabled
    ? slots.context.priceAgorot
    : null;
  if (slots.context.pricingEnabled && priceAgorot === null)
    throw new Error("Pricing-enabled Service has no persisted price");

  const booking = await insertConfirmedBookingInTransaction(trx, {
    organizationId: input.organizationId,
    resourceId: resource.id,
    serviceId: slots.context.serviceId,
    publicReference,
    startAt: input.startAt,
    durationMinutes: slots.context.durationMinutes,
    bufferAfterMinutes: slots.context.bufferAfterMinutes,
    priceAgorot,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail,
    customerNote: input.customerNote,
    cancellationCutoffMinutes: organization.cancellation_cutoff_minutes,
  });
  await insertOutboxEventInTransaction(trx, {
    aggregateType: "booking",
    aggregateId: booking.id,
    eventType: bookingEventType.created,
    payload: createBookingCreatedEventPayload(booking),
    occurredAt: now,
  });
  return {
    ok: true,
    booking,
  };
}

function normalizeManualBookingInput(
  input: CreateManualBookingInput,
): NormalizedManualBookingInput | CreateManualBookingResult {
  if (!isLocalDate(input.date)) return { ok: false, reason: "invalid_date" };
  if (
    !Number.isInteger(input.startMinute) ||
    input.startMinute < 0 ||
    input.startMinute >= 1440
  )
    return { ok: false, reason: "invalid_start_time" };
  const guestName = normalizeGuestName(input.guestName);
  if (!guestName.ok) return guestName;
  const guestPhone = normalizeOptionalIsraeliGuestPhone(input.guestPhone);
  if (!guestPhone.ok) return guestPhone;
  const startAt = localBookingStartToUtc(input.date, input.startMinute);
  if (!startAt) return { ok: false, reason: "invalid_start_time" };
  return {
    ...input,
    guestName: guestName.guestName,
    guestPhone: guestPhone.guestPhone,
    guestEmail: normalizeGuestEmail(input.guestEmail),
    customerNote: input.customerNote ?? null,
    startAt,
  };
}

export async function createManualBooking(
  input: CreateManualBookingInput,
  now: Date = new Date(),
): Promise<CreateManualBookingResult> {
  const operationNow = cloneValidOperationTime(
    now,
    "Manual Booking creation now must be a valid Date",
  );
  const normalized = normalizeManualBookingInput(input);
  if ("ok" in normalized) return normalized;
  return runConfirmedBookingWriteWithRetries({
    executeTransactionAttempt: (publicReference) =>
      executeManualBookingTransaction(
        normalized,
        publicReference,
        operationNow,
      ),
  });
}
