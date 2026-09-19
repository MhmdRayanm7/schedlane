import { db } from "../../db.js";
import {
  type ResolvePublicResourceServiceAvailabilityInTransactionResult,
  resolvePublicResourceServiceAvailabilityInTransaction,
} from "../availability/public-resource-service-availability.js";
import { localBookingStartToUtc } from "./booking-time.js";
import {
  type ConfirmedBooking,
  insertConfirmedBookingInTransaction,
  runConfirmedBookingWriteWithRetries,
} from "./confirmed-booking-write.js";

export type CreatePublicBookingInput = {
  organizationSlug: string;
  resourceId: string;
  serviceId: string;
  date: string;
  startMinute: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  customerNote?: string | null;
};

type CreatePublicBookingFailure =
  | "invalid_date"
  | "invalid_start_time"
  | "invalid_guest_name"
  | "invalid_guest_phone"
  | "date_outside_booking_window"
  | "public_booking_not_found"
  | "slot_unavailable"
  | "booking_conflict";

export type CreatePublicBookingResult =
  | { ok: true; booking: ConfirmedBooking }
  | { ok: false; reason: CreatePublicBookingFailure };

type NormalizedPublicBookingInput = Omit<
  CreatePublicBookingInput,
  "guestName" | "guestPhone" | "guestEmail" | "customerNote"
> & {
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  customerNote: string | null;
};

function normalizePublicBookingInput(
  input: CreatePublicBookingInput,
): NormalizedPublicBookingInput | CreatePublicBookingResult {
  if (
    !Number.isInteger(input.startMinute) ||
    input.startMinute < 0 ||
    input.startMinute >= 1440
  )
    return { ok: false, reason: "invalid_start_time" };

  const guestName = input.guestName.trim();
  if (guestName === "") return { ok: false, reason: "invalid_guest_name" };
  const guestPhone = input.guestPhone.trim();
  if (guestPhone === "") return { ok: false, reason: "invalid_guest_phone" };
  const guestEmail = input.guestEmail?.trim() || null;

  return {
    ...input,
    guestName,
    guestPhone,
    guestEmail,
    customerNote: input.customerNote ?? null,
  };
}

function mapPublicAvailabilityFailure(
  result: Extract<
    ResolvePublicResourceServiceAvailabilityInTransactionResult,
    { ok: false }
  >,
): CreatePublicBookingResult {
  if (
    result.reason === "invalid_date" ||
    result.reason === "date_outside_booking_window"
  )
    return { ok: false, reason: result.reason };
  return { ok: false, reason: "public_booking_not_found" };
}

async function executePublicBookingTransaction(
  input: NormalizedPublicBookingInput,
  publicReference: string,
  now: Date,
): Promise<CreatePublicBookingResult> {
  return db
    .transaction()
    .setIsolationLevel("serializable")
    .execute(async (trx) => {
      const availability =
        await resolvePublicResourceServiceAvailabilityInTransaction(
          trx,
          {
            organizationSlug: input.organizationSlug,
            resourceId: input.resourceId,
            serviceId: input.serviceId,
            date: input.date,
          },
          now,
        );
      if (!availability.ok) return mapPublicAvailabilityFailure(availability);
      const startAt = localBookingStartToUtc(input.date, input.startMinute);
      if (!startAt) return { ok: false, reason: "invalid_start_time" };
      if (!availability.context.starts.includes(input.startMinute))
        return { ok: false, reason: "slot_unavailable" };

      const priceAgorot = availability.context.pricingEnabled
        ? availability.context.priceAgorot
        : null;
      if (availability.context.pricingEnabled && priceAgorot === null)
        throw new Error("Pricing-enabled Service has no persisted price");

      const booking = await insertConfirmedBookingInTransaction(trx, {
        organizationId: availability.context.organizationId,
        resourceId: availability.context.resourceId,
        serviceId: availability.context.serviceId,
        publicReference,
        startAt,
        durationMinutes: availability.context.durationMinutes,
        bufferAfterMinutes: availability.context.bufferAfterMinutes,
        priceAgorot,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        guestEmail: input.guestEmail,
        customerNote: input.customerNote,
      });
      return { ok: true, booking };
    });
}

export async function createPublicBooking(
  input: CreatePublicBookingInput,
  now: Date = new Date(),
): Promise<CreatePublicBookingResult> {
  const normalized = normalizePublicBookingInput(input);
  if ("ok" in normalized) return normalized;

  return runConfirmedBookingWriteWithRetries({
    executeTransactionAttempt: (publicReference) =>
      executePublicBookingTransaction(
        normalized,
        publicReference,
        new Date(now.getTime()),
      ),
  });
}
