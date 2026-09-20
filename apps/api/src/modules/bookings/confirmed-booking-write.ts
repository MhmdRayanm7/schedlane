import type { Transaction } from "kysely";
import type { Database } from "../../db-types.js";
import { generateBookingPublicReference } from "./booking-public-reference.js";
import { calculateBookingTemporalSnapshot } from "./booking-time.js";

const MAX_SERIALIZATION_ATTEMPTS = 3;
const MAX_PUBLIC_REFERENCE_ATTEMPTS = 5;
const BOOKING_CONFLICT_CONSTRAINT = "booking_confirmed_resource_occupancy_excl";
const BOOKING_PUBLIC_REFERENCE_CONSTRAINT = "booking_public_reference_key";

export type ConfirmedBooking = {
  id: string;
  publicReference: string;
  status: "confirmed";
  organizationId: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  serviceEndAt: string;
  occupiedUntilAt: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  priceAgorot: number | null;
  guestName: string;
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
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  customerNote: string | null;
  cancellationCutoffMinutes: number;
  guestManagementTokenHash?: string | null;
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
    })
    .returning([
      "id",
      "public_reference",
      "status",
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
  | { ok: true; booking: ConfirmedBooking }
  | { ok: false; reason: string };

type RunConfirmedBookingWriteDependencies<
  Result extends ConfirmedBookingWriteResult,
> = {
  executeTransactionAttempt: (publicReference: string) => Promise<Result>;
  generatePublicReference?: () => string;
};

function databaseError(error: unknown): {
  code?: string;
  constraint?: string;
} {
  return typeof error === "object" && error !== null
    ? (error as { code?: string; constraint?: string })
    : {};
}

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
        const { code, constraint } = databaseError(error);
        if (
          code === "40001" &&
          serializationAttempt < MAX_SERIALIZATION_ATTEMPTS
        )
          continue;
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
