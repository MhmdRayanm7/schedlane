import type { Transaction } from "kysely";
import { db } from "../../db.js";
import type { Database } from "../../db-types.js";
import { isLocalDate } from "../availability/local-date.js";
import { resolveResourceServiceSlotContextAfterAccessInTransaction } from "../availability/resource-service-slot-resolver.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../organizations/organization-write-policy.js";
import { canCreateManualBookingForResource } from "./booking-policy.js";
import { generateBookingPublicReference } from "./booking-public-reference.js";
import {
  calculateBookingTemporalSnapshot,
  localBookingStartToUtc,
} from "./booking-time.js";

const MAX_SERIALIZATION_ATTEMPTS = 3;
const MAX_PUBLIC_REFERENCE_ATTEMPTS = 5;
const BOOKING_CONFLICT_CONSTRAINT = "booking_confirmed_resource_occupancy_excl";
const BOOKING_PUBLIC_REFERENCE_CONSTRAINT = "booking_public_reference_key";

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
  | "start_not_available"
  | "booking_conflict";

export type CreateManualBookingResult =
  | {
      ok: true;
      booking: {
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

type ExecuteTransactionAttempt = (
  input: NormalizedManualBookingInput,
  publicReference: string,
) => Promise<CreateManualBookingResult>;

type ManualBookingDependencies = {
  generatePublicReference: () => string;
  executeTransactionAttempt: ExecuteTransactionAttempt;
};

function databaseError(error: unknown): {
  code?: string;
  constraint?: string;
} {
  return typeof error === "object" && error !== null
    ? (error as { code?: string; constraint?: string })
    : {};
}

async function executeManualBookingTransaction(
  input: NormalizedManualBookingInput,
  publicReference: string,
): Promise<CreateManualBookingResult> {
  return db
    .transaction()
    .setIsolationLevel("serializable")
    .execute((trx) =>
      createManualBookingInTransaction(trx, input, publicReference),
    );
}

async function createManualBookingInTransaction(
  trx: Transaction<Database>,
  input: NormalizedManualBookingInput,
  publicReference: string,
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
    !canCreateManualBookingForResource(
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

  const { serviceEndAt, occupiedUntilAt } = calculateBookingTemporalSnapshot(
    input.startAt,
    slots.context.durationMinutes,
    slots.context.bufferAfterMinutes,
  );
  const booking = await trx
    .insertInto("booking")
    .values({
      organization_id: input.organizationId,
      resource_id: resource.id,
      service_id: slots.context.serviceId,
      public_reference: publicReference,
      status: "confirmed",
      start_at: input.startAt,
      service_end_at: serviceEndAt,
      occupied_until_at: occupiedUntilAt,
      duration_minutes: slots.context.durationMinutes,
      buffer_after_minutes: slots.context.bufferAfterMinutes,
      price_agorot: priceAgorot,
      guest_name: input.guestName,
      guest_phone: input.guestPhone,
      guest_email: input.guestEmail,
      customer_note: input.customerNote,
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
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
    throw new Error("New manual Booking did not persist as confirmed");
  return {
    ok: true,
    booking: {
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
    },
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
  const guestName = input.guestName.trim();
  if (guestName === "") return { ok: false, reason: "invalid_guest_name" };
  const startAt = localBookingStartToUtc(input.date, input.startMinute);
  if (!startAt) return { ok: false, reason: "invalid_start_time" };
  return {
    ...input,
    guestName,
    guestPhone: input.guestPhone ?? null,
    guestEmail: input.guestEmail ?? null,
    customerNote: input.customerNote ?? null,
    startAt,
  };
}

async function createManualBookingWithDependencies(
  input: CreateManualBookingInput,
  dependencies: ManualBookingDependencies,
): Promise<CreateManualBookingResult> {
  const normalized = normalizeManualBookingInput(input);
  if ("ok" in normalized) return normalized;

  for (
    let referenceAttempt = 1;
    referenceAttempt <= MAX_PUBLIC_REFERENCE_ATTEMPTS;
    referenceAttempt += 1
  ) {
    const publicReference = dependencies.generatePublicReference();
    let referenceCollision = false;

    for (
      let serializationAttempt = 1;
      serializationAttempt <= MAX_SERIALIZATION_ATTEMPTS;
      serializationAttempt += 1
    ) {
      try {
        return await dependencies.executeTransactionAttempt(
          normalized,
          publicReference,
        );
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
      throw new Error("Manual Booking transaction attempt did not complete");
  }

  throw new Error("Could not allocate a unique Booking public reference");
}

const productionDependencies: ManualBookingDependencies = {
  generatePublicReference: generateBookingPublicReference,
  executeTransactionAttempt: executeManualBookingTransaction,
};

export function createManualBooking(
  input: CreateManualBookingInput,
): Promise<CreateManualBookingResult> {
  return createManualBookingWithDependencies(input, productionDependencies);
}

export const manualBookingTestInternals = {
  createManualBookingWithDependencies,
  maxSerializationAttempts: MAX_SERIALIZATION_ATTEMPTS,
  maxPublicReferenceAttempts: MAX_PUBLIC_REFERENCE_ATTEMPTS,
};
