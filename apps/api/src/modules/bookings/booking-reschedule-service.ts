import type { Transaction } from "kysely";
import { db } from "../../db.js";
import type { BookingStatus, Database } from "../../db-types.js";
import { isLocalDate } from "../availability/local-date.js";
import { resolveResourceServiceSnapshotSlotContextAfterAccessInTransaction } from "../availability/resource-service-slot-resolver.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../organizations/organization-write-policy.js";
import { canManageBookingForResource } from "./booking-policy.js";
import {
  calculateBookingTemporalSnapshot,
  localBookingStartToUtc,
} from "./booking-time.js";

const MAX_SERIALIZATION_ATTEMPTS = 3;
const BOOKING_CONFLICT_CONSTRAINT = "booking_confirmed_resource_occupancy_excl";

export type RescheduleManagementBookingInput = {
  userId: string;
  organizationId: string;
  bookingId: string;
  resourceId: string;
  date: string;
  startMinute: number;
};

export type ManagementBookingRescheduleDto = {
  id: string;
  publicReference: string;
  status: BookingStatus;
  resourceId: string;
  serviceId: string;
  startAt: string;
  serviceEndAt: string;
  occupiedUntilAt: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  priceAgorot: number | null;
  updatedAt: string;
};

type RescheduleManagementBookingFailure =
  | "organization_not_found"
  | OrganizationWriteStateFailure
  | "booking_not_found"
  | "insufficient_role"
  | "invalid_booking_status"
  | "resource_not_found"
  | "resource_inactive"
  | "service_not_found"
  | "service_not_assigned"
  | "invalid_date"
  | "invalid_start_time"
  | "reschedule_start_in_past"
  | "start_not_available"
  | "booking_conflict";

export type RescheduleManagementBookingResult =
  | { ok: true; booking: ManagementBookingRescheduleDto }
  | { ok: false; reason: RescheduleManagementBookingFailure };

type NormalizedRescheduleInput = RescheduleManagementBookingInput & {
  startAt: Date;
};

function databaseError(error: unknown): {
  code?: string;
  constraint?: string;
} {
  return typeof error === "object" && error !== null
    ? (error as { code?: string; constraint?: string })
    : {};
}

async function runWithSerializationRetry<Result>(
  attempt: () => Promise<Result>,
): Promise<Result> {
  for (
    let serializationAttempt = 1;
    serializationAttempt <= MAX_SERIALIZATION_ATTEMPTS;
    serializationAttempt += 1
  ) {
    try {
      return await attempt();
    } catch (error) {
      if (
        databaseError(error).code === "40001" &&
        serializationAttempt < MAX_SERIALIZATION_ATTEMPTS
      )
        continue;
      throw error;
    }
  }
  throw new Error("Booking reschedule transaction attempt did not complete");
}

function toRescheduleDto(row: {
  id: string;
  public_reference: string;
  status: BookingStatus;
  resource_id: string;
  service_id: string;
  start_at: Date;
  service_end_at: Date;
  occupied_until_at: Date;
  duration_minutes: number;
  buffer_after_minutes: number;
  price_agorot: number | null;
  updated_at: Date;
}): ManagementBookingRescheduleDto {
  return {
    id: row.id,
    publicReference: row.public_reference,
    status: row.status,
    resourceId: row.resource_id,
    serviceId: row.service_id,
    startAt: row.start_at.toISOString(),
    serviceEndAt: row.service_end_at.toISOString(),
    occupiedUntilAt: row.occupied_until_at.toISOString(),
    durationMinutes: row.duration_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    priceAgorot: row.price_agorot,
    updatedAt: row.updated_at.toISOString(),
  };
}

async function rescheduleInTransaction(
  trx: Transaction<Database>,
  input: NormalizedRescheduleInput,
  now: Date,
): Promise<RescheduleManagementBookingResult> {
  const membership = await trx
    .selectFrom("membership")
    .select("role")
    .where("organization_id", "=", input.organizationId)
    .where("user_id", "=", input.userId)
    .executeTakeFirst();
  if (!membership) return { ok: false, reason: "organization_not_found" };

  const writeState = await requireWritableOrganization(
    trx,
    input.organizationId,
  );
  if (!writeState.ok) return writeState;

  const booking = await trx
    .selectFrom("booking")
    .select([
      "id",
      "status",
      "resource_id",
      "service_id",
      "duration_minutes",
      "buffer_after_minutes",
    ])
    .where("id", "=", input.bookingId)
    .where("organization_id", "=", input.organizationId)
    .forUpdate()
    .executeTakeFirst();
  if (!booking) return { ok: false, reason: "booking_not_found" };

  const sourceResource = await trx
    .selectFrom("resource")
    .select("user_id")
    .where("id", "=", booking.resource_id)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirstOrThrow();
  if (
    !canManageBookingForResource(
      { userId: input.userId, role: membership.role },
      sourceResource.user_id,
    )
  )
    return { ok: false, reason: "insufficient_role" };
  if (booking.status !== "confirmed")
    return { ok: false, reason: "invalid_booking_status" };

  const targetResource = await trx
    .selectFrom("resource")
    .select(["id", "user_id", "deactivated_at"])
    .where("id", "=", input.resourceId)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirst();
  if (!targetResource) return { ok: false, reason: "resource_not_found" };
  if (targetResource.deactivated_at)
    return { ok: false, reason: "resource_inactive" };
  if (
    !canManageBookingForResource(
      { userId: input.userId, role: membership.role },
      targetResource.user_id,
    )
  )
    return { ok: false, reason: "insufficient_role" };

  const slots =
    await resolveResourceServiceSnapshotSlotContextAfterAccessInTransaction(
      trx,
      {
        organizationId: input.organizationId,
        resourceId: targetResource.id,
        serviceId: booking.service_id,
        date: input.date,
        durationMinutes: booking.duration_minutes,
        bufferAfterMinutes: booking.buffer_after_minutes,
      },
    );
  if (!slots.ok) return slots;
  if (!slots.context.starts.includes(input.startMinute))
    return { ok: false, reason: "start_not_available" };

  const { serviceEndAt, occupiedUntilAt } = calculateBookingTemporalSnapshot(
    input.startAt,
    booking.duration_minutes,
    booking.buffer_after_minutes,
  );
  const row = await trx
    .updateTable("booking")
    .set({
      resource_id: targetResource.id,
      start_at: input.startAt,
      service_end_at: serviceEndAt,
      occupied_until_at: occupiedUntilAt,
      updated_at: now,
    })
    .where("id", "=", booking.id)
    .where("organization_id", "=", input.organizationId)
    .returning([
      "id",
      "public_reference",
      "status",
      "resource_id",
      "service_id",
      "start_at",
      "service_end_at",
      "occupied_until_at",
      "duration_minutes",
      "buffer_after_minutes",
      "price_agorot",
      "updated_at",
    ])
    .executeTakeFirstOrThrow();
  return { ok: true, booking: toRescheduleDto(row) };
}

export async function rescheduleManagementBooking(
  input: RescheduleManagementBookingInput,
  now: Date = new Date(),
): Promise<RescheduleManagementBookingResult> {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error("Booking reschedule now must be a valid Date");
  const operationNow = new Date(now.getTime());
  if (!isLocalDate(input.date)) return { ok: false, reason: "invalid_date" };
  if (
    !Number.isInteger(input.startMinute) ||
    input.startMinute < 0 ||
    input.startMinute >= 1440
  )
    return { ok: false, reason: "invalid_start_time" };
  const startAt = localBookingStartToUtc(input.date, input.startMinute);
  if (!startAt) return { ok: false, reason: "invalid_start_time" };
  if (startAt.getTime() < operationNow.getTime())
    return { ok: false, reason: "reschedule_start_in_past" };

  try {
    return await runWithSerializationRetry(() =>
      db
        .transaction()
        .setIsolationLevel("serializable")
        .execute((trx) =>
          rescheduleInTransaction(trx, { ...input, startAt }, operationNow),
        ),
    );
  } catch (error) {
    const { code, constraint } = databaseError(error);
    if (code === "23P01" && constraint === BOOKING_CONFLICT_CONSTRAINT)
      return { ok: false, reason: "booking_conflict" };
    throw error;
  }
}

export const bookingRescheduleTestInternals = {
  runWithSerializationRetry,
  maxSerializationAttempts: MAX_SERIALIZATION_ATTEMPTS,
};
