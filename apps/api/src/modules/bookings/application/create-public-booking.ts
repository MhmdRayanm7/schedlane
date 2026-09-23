import { config } from "../../../config.js";
import { db } from "../../../db.js";
import { insertOutboxEventInTransaction } from "../../../outbox/persistence.js";
import {
  type ResolvePublicResourceServiceAvailabilityInTransactionResult,
  resolvePublicResourceServiceAvailabilityInTransaction,
} from "../../availability/resolvers/public-resource-service-availability.js";
import {
  bookingEventType,
  createBookingCreatedEventPayload,
} from "../domain/events.js";
import {
  normalizeGuestEmail,
  normalizeGuestName,
  normalizeIsraeliGuestPhone,
} from "../domain/guest-contact.js";
import {
  encryptGuestManagementToken,
  generateGuestManagementToken,
  hashGuestManagementToken,
} from "../domain/management-token.js";
import { localBookingStartToUtc } from "../domain/time.js";
import {
  type ConfirmedBooking,
  insertConfirmedBookingInTransaction,
  runConfirmedBookingWriteWithRetries,
} from "../persistence/confirmed-booking-write.js";
import { postgresErrorMetadata } from "../persistence/postgres-errors.js";

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
  | { ok: true; booking: ConfirmedBooking; managementToken: string }
  | { ok: false; reason: CreatePublicBookingFailure };

type PublicBookingTransactionResult =
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

  const guestName = normalizeGuestName(input.guestName);
  if (!guestName.ok) return guestName;
  const guestPhone = normalizeIsraeliGuestPhone(input.guestPhone);
  if (!guestPhone.ok) return guestPhone;

  return {
    ...input,
    guestName: guestName.guestName,
    guestPhone: guestPhone.guestPhone,
    guestEmail: normalizeGuestEmail(input.guestEmail),
    customerNote: input.customerNote ?? null,
  };
}

function mapPublicAvailabilityFailure(
  result: Extract<
    ResolvePublicResourceServiceAvailabilityInTransactionResult,
    { ok: false }
  >,
): Extract<PublicBookingTransactionResult, { ok: false }> {
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
  guestManagementTokenHash: string,
  guestManagementTokenEncrypted: string,
): Promise<PublicBookingTransactionResult> {
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
        cancellationCutoffMinutes:
          availability.context.cancellationCutoffMinutes,
        guestManagementTokenHash,
        guestManagementTokenEncrypted,
      });
      await insertOutboxEventInTransaction(trx, {
        aggregateType: "booking",
        aggregateId: booking.id,
        eventType: bookingEventType.created,
        payload: createBookingCreatedEventPayload(booking),
        occurredAt: now,
      });
      return { ok: true, booking };
    });
}

const MAX_GUEST_MANAGEMENT_TOKEN_ATTEMPTS = 5;
const GUEST_MANAGEMENT_TOKEN_CONSTRAINT =
  "booking_guest_management_token_hash_key";

type CreatePublicBookingDependencies = {
  generateManagementToken?: () => string;
  encryptionKey?: string | Buffer;
};

export async function createPublicBooking(
  input: CreatePublicBookingInput,
  now: Date = new Date(),
  dependencies: CreatePublicBookingDependencies = {},
): Promise<CreatePublicBookingResult> {
  const normalized = normalizePublicBookingInput(input);
  if ("ok" in normalized) return normalized;

  const generateManagementToken =
    dependencies.generateManagementToken ?? generateGuestManagementToken;
  const encryptionKey =
    dependencies.encryptionKey ?? config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY;
  for (
    let tokenAttempt = 1;
    tokenAttempt <= MAX_GUEST_MANAGEMENT_TOKEN_ATTEMPTS;
    tokenAttempt += 1
  ) {
    const managementToken = generateManagementToken();
    const managementTokenHash = hashGuestManagementToken(managementToken);
    const managementTokenEncrypted = encryptGuestManagementToken(
      managementToken,
      encryptionKey,
    );
    try {
      const result = await runConfirmedBookingWriteWithRetries({
        executeTransactionAttempt: (publicReference) =>
          executePublicBookingTransaction(
            normalized,
            publicReference,
            new Date(now.getTime()),
            managementTokenHash,
            managementTokenEncrypted,
          ),
      });
      return result.ok ? { ...result, managementToken } : result;
    } catch (error) {
      const { code, constraint } = postgresErrorMetadata(error);
      if (
        code === "23505" &&
        constraint === GUEST_MANAGEMENT_TOKEN_CONSTRAINT &&
        tokenAttempt < MAX_GUEST_MANAGEMENT_TOKEN_ATTEMPTS
      )
        continue;
      if (code === "23505" && constraint === GUEST_MANAGEMENT_TOKEN_CONSTRAINT)
        throw new Error("Could not allocate a unique guest management token");
      throw error;
    }
  }
  throw new Error("Could not allocate a unique guest management token");
}

export const publicBookingTestInternals = {
  maxGuestManagementTokenAttempts: MAX_GUEST_MANAGEMENT_TOKEN_ATTEMPTS,
};
