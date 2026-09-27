import type { Transaction } from "kysely";
import type { BookingSource, Database } from "../../../db-types.js";
import { generateBookingPublicReference } from "../domain/public-reference.js";
import { calculateBookingTemporalSnapshot } from "../domain/time.js";
import { postgresErrorMetadata } from "./postgres-errors.js";

const MAX_SERIALIZATION_ATTEMPTS = 3;
const MAX_PUBLIC_REFERENCE_ATTEMPTS = 5;
const BOOKING_CONFLICT_CONSTRAINT = "booking_confirmed_resource_occupancy_excl";
const BOOKING_PUBLIC_REFERENCE_CONSTRAINT = "booking_public_reference_key";

export type ConfirmedBooking = {
  id: string;
  publicReference: string;
  status: "confirmed";
  source: BookingSource;
  createdByUserId: string | null;
  organizationId: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  serviceEndAt: string;
  occupiedUntilAt: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  priceAgorot: number | null;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  customerNote: string | null;
  createdAt: string;
};

export type InsertConfirmedBookingInput = {
  organizationId: string;
  resourceId: string;
  serviceId: string;
  publicReference: string;
  startAt: Date;
  durationMinutes: number;
  bufferAfterMinutes: number;
  priceAgorot: number | null;
  source: BookingSource;
  createdByUserId: string | null;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  customerNote: string | null;
  cancellationCutoffMinutes: number;
  guestManagementTokenHash?: string | null;
  guestManagementTokenEncrypted?: string | null;
};

export async function insertConfirmedBookingInTransaction(
  trx: Transaction<Database>,
  input: InsertConfirmedBookingInput,
): Promise<ConfirmedBooking> {
  const { serviceEndAt, occupiedUntilAt } = calculateBookingTemporalSnapshot(
    input.startAt,
    input.durationMinutes,
    input.bufferAfterMinutes,
  );
  const booking = await trx
    .insertInto("booking")
    .values({
      organization_id: input.organizationId,
      resource_id: input.resourceId,
      service_id: input.serviceId,
      public_reference: input.publicReference,
      status: "confirmed",
      source: input.source,
      created_by_user_id: input.createdByUserId,
      start_at: input.startAt,
      service_end_at: serviceEndAt,
      occupied_until_at: occupiedUntilAt,
      duration_minutes: input.durationMinutes,
      buffer_after_minutes: input.bufferAfterMinutes,
      price_agorot: input.priceAgorot,
      guest_name: input.guestName,
      guest_phone: input.guestPhone,
      guest_email: input.guestEmail,
      customer_note: input.customerNote,
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
      cancellation_cutoff_minutes: input.cancellationCutoffMinutes,
      guest_management_token_hash: input.guestManagementTokenHash ?? null,
      guest_management_token_encrypted:
        input.guestManagementTokenEncrypted ?? null,
    })
    .returning([
      "id",
      "public_reference",
      "status",
      "source",
      "created_by_user_id",
      "organization_id",
      "resource_id",
      "service_id",
      "start_at",
      "service_end_at",
      "occupied_until_at",
      "duration_minutes",
      "buffer_after_minutes",
      "price_agorot",
      "guest_name",
      "guest_phone",
      "guest_email",
      "customer_note",
      "created_at",
    ])
    .executeTakeFirstOrThrow();

  if (booking.status !== "confirmed")
    throw new Error("New Booking did not persist as confirmed");
  return {
    id: booking.id,
    publicReference: booking.public_reference,
    status: booking.status,
    source: booking.source,
    createdByUserId: booking.created_by_user_id,
    organizationId: booking.organization_id,
    resourceId: booking.resource_id,
    serviceId: booking.service_id,
    startAt: booking.start_at.toISOString(),
    serviceEndAt: booking.service_end_at.toISOString(),
    occupiedUntilAt: booking.occupied_until_at.toISOString(),
    durationMinutes: booking.duration_minutes,
    bufferAfterMinutes: booking.buffer_after_minutes,
    priceAgorot: booking.price_agorot,
    guestName: booking.guest_name,
    guestPhone: booking.guest_phone,
    guestEmail: booking.guest_email,
    customerNote: booking.customer_note,
    createdAt: booking.created_at.toISOString(),
  };
}

type ConfirmedBookingWriteResult =
  | { ok: true; booking: unknown }
  | { ok: false; reason: string };

type RunConfirmedBookingWriteDependencies<
  Result extends ConfirmedBookingWriteResult,
> = {
  executeTransactionAttempt: (publicReference: string) => Promise<Result>;
  generatePublicReference?: () => string;
};

export async function runConfirmedBookingWriteWithRetries<
  Result extends ConfirmedBookingWriteResult,
>({
  executeTransactionAttempt,
  generatePublicReference = generateBookingPublicReference,
}: RunConfirmedBookingWriteDependencies<Result>): Promise<
  Result | { ok: false; reason: "booking_conflict" }
> {
  for (
    let referenceAttempt = 1;
    referenceAttempt <= MAX_PUBLIC_REFERENCE_ATTEMPTS;
    referenceAttempt += 1
  ) {
    const publicReference = generatePublicReference();
    let referenceCollision = false;

    for (
      let serializationAttempt = 1;
      serializationAttempt <= MAX_SERIALIZATION_ATTEMPTS;
      serializationAttempt += 1
    ) {
      try {
        return await executeTransactionAttempt(publicReference);
      } catch (error) {
        const { code, constraint } = postgresErrorMetadata(error);
        if (
          (code === "40001" || code === "40P01") &&
          serializationAttempt < MAX_SERIALIZATION_ATTEMPTS
        )
          continue;
        if (code === "40P01") return { ok: false, reason: "booking_conflict" };
        if (
          code === "23505" &&
          constraint === BOOKING_PUBLIC_REFERENCE_CONSTRAINT
        ) {
          referenceCollision = true;
          break;
        }
        if (code === "23P01" && constraint === BOOKING_CONFLICT_CONSTRAINT)
          return { ok: false, reason: "booking_conflict" };
        throw error;
      }
    }

    if (!referenceCollision)
      throw new Error("Confirmed Booking transaction attempt did not complete");
  }

  throw new Error("Could not allocate a unique Booking public reference");
}

export const confirmedBookingWriteTestInternals = {
  maxSerializationAttempts: MAX_SERIALIZATION_ATTEMPTS,
  maxPublicReferenceAttempts: MAX_PUBLIC_REFERENCE_ATTEMPTS,
};
