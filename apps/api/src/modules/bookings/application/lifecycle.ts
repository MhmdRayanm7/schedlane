import type { Transaction } from "kysely";
import { db } from "../../../db.js";
import type { BookingStatus, Database } from "../../../db-types.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";
import { canManageBookingForResource } from "../domain/policy.js";

const MAX_SERIALIZATION_ATTEMPTS = 3;
const BOOKING_CONFLICT_CONSTRAINT = "booking_confirmed_resource_occupancy_excl";

type ManagementBookingActionInput = {
  userId: string;
  organizationId: string;
  bookingId: string;
};

export type CancelManagementBookingInput = ManagementBookingActionInput & {
  reason?: string | null;
};

export type BookingLifecycleDto = {
  id: string;
  publicReference: string;
  status: BookingStatus;
  cancelledAt: string | null;
  cancellationReason: string | null;
  updatedAt: string;
};

type BookingLifecycleAccessFailure =
  | "organization_not_found"
  | OrganizationWriteStateFailure
  | "booking_not_found"
  | "insufficient_role";

export type CancelManagementBookingResult =
  | { ok: true; booking: BookingLifecycleDto }
  | {
      ok: false;
      reason: BookingLifecycleAccessFailure | "invalid_booking_status";
    };

export type MarkManagementBookingNoShowResult =
  | { ok: true; booking: BookingLifecycleDto }
  | {
      ok: false;
      reason:
        | BookingLifecycleAccessFailure
        | "invalid_booking_status"
        | "no_show_too_early";
    };

export type RevertManagementBookingNoShowResult =
  | { ok: true; booking: BookingLifecycleDto }
  | {
      ok: false;
      reason:
        | BookingLifecycleAccessFailure
        | "invalid_booking_status"
        | "booking_conflict";
    };

type LockedManagementBooking = {
  id: string;
  status: BookingStatus;
  startAt: Date;
};

type LoadManagementBookingResult =
  | { ok: true; booking: LockedManagementBooking }
  | { ok: false; reason: BookingLifecycleAccessFailure };

function operationNow(now: Date): Date {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error("Booking lifecycle now must be a valid Date");
  return new Date(now.getTime());
}

function databaseError(error: unknown): {
  code?: string;
  constraint?: string;
} {
  return typeof error === "object" && error !== null
    ? (error as { code?: string; constraint?: string })
    : {};
}

async function runBookingLifecycleWithSerializationRetry<Result>(
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
  throw new Error("Booking lifecycle transaction attempt did not complete");
}

async function loadManagementBookingForUpdate(
  trx: Transaction<Database>,
  input: ManagementBookingActionInput,
): Promise<LoadManagementBookingResult> {
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
    .select(["id", "status", "resource_id", "start_at"])
    .where("id", "=", input.bookingId)
    .where("organization_id", "=", input.organizationId)
    .forUpdate()
    .executeTakeFirst();
  if (!booking) return { ok: false, reason: "booking_not_found" };

  const resource = await trx
    .selectFrom("resource")
    .select("user_id")
    .where("id", "=", booking.resource_id)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirstOrThrow();
  if (
    !canManageBookingForResource(
      { userId: input.userId, role: membership.role },
      resource.user_id,
    )
  )
    return { ok: false, reason: "insufficient_role" };

  return {
    ok: true,
    booking: {
      id: booking.id,
      status: booking.status,
      startAt: booking.start_at,
    },
  };
}

function toLifecycleDto(row: {
  id: string;
  public_reference: string;
  status: BookingStatus;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  updated_at: Date;
}): BookingLifecycleDto {
  return {
    id: row.id,
    publicReference: row.public_reference,
    status: row.status,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    cancellationReason: row.cancellation_reason,
    updatedAt: row.updated_at.toISOString(),
  };
}

const lifecycleReturning = [
  "id",
  "public_reference",
  "status",
  "cancelled_at",
  "cancellation_reason",
  "updated_at",
] as const;

export async function cancelManagementBooking(
  input: CancelManagementBookingInput,
  now: Date = new Date(),
): Promise<CancelManagementBookingResult> {
  const currentTime = operationNow(now);
  const normalizedReason = input.reason?.trim() || null;
  return runBookingLifecycleWithSerializationRetry(() =>
    db
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (trx) => {
        const access = await loadManagementBookingForUpdate(trx, input);
        if (!access.ok) return access;
        if (access.booking.status !== "confirmed")
          return { ok: false, reason: "invalid_booking_status" };

        const row = await trx
          .updateTable("booking")
          .set({
            status: "cancelled",
            cancelled_at: currentTime,
            cancelled_by_user_id: input.userId,
            cancellation_reason: normalizedReason,
            updated_at: currentTime,
          })
          .where("id", "=", access.booking.id)
          .where("organization_id", "=", input.organizationId)
          .returning(lifecycleReturning)
          .executeTakeFirstOrThrow();
        return { ok: true, booking: toLifecycleDto(row) };
      }),
  );
}

export async function markManagementBookingNoShow(
  input: ManagementBookingActionInput,
  now: Date = new Date(),
): Promise<MarkManagementBookingNoShowResult> {
  const currentTime = operationNow(now);
  return runBookingLifecycleWithSerializationRetry(() =>
    db
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (trx) => {
        const access = await loadManagementBookingForUpdate(trx, input);
        if (!access.ok) return access;
        if (access.booking.status !== "confirmed")
          return { ok: false, reason: "invalid_booking_status" };
        if (currentTime.getTime() < access.booking.startAt.getTime())
          return { ok: false, reason: "no_show_too_early" };

        const row = await trx
          .updateTable("booking")
          .set({
            status: "no_show",
            cancelled_at: null,
            cancelled_by_user_id: null,
            cancellation_reason: null,
            updated_at: currentTime,
          })
          .where("id", "=", access.booking.id)
          .where("organization_id", "=", input.organizationId)
          .returning(lifecycleReturning)
          .executeTakeFirstOrThrow();
        return { ok: true, booking: toLifecycleDto(row) };
      }),
  );
}

export async function revertManagementBookingNoShow(
  input: ManagementBookingActionInput,
  now: Date = new Date(),
): Promise<RevertManagementBookingNoShowResult> {
  const currentTime = operationNow(now);
  try {
    return await runBookingLifecycleWithSerializationRetry(() =>
      db
        .transaction()
        .setIsolationLevel("serializable")
        .execute(async (trx) => {
          const access = await loadManagementBookingForUpdate(trx, input);
          if (!access.ok) return access;
          if (access.booking.status !== "no_show")
            return { ok: false, reason: "invalid_booking_status" };

          const row = await trx
            .updateTable("booking")
            .set({
              status: "confirmed",
              cancelled_at: null,
              cancelled_by_user_id: null,
              cancellation_reason: null,
              updated_at: currentTime,
            })
            .where("id", "=", access.booking.id)
            .where("organization_id", "=", input.organizationId)
            .returning(lifecycleReturning)
            .executeTakeFirstOrThrow();
          return { ok: true, booking: toLifecycleDto(row) };
        }),
    );
  } catch (error) {
    const { code, constraint } = databaseError(error);
    if (code === "23P01" && constraint === BOOKING_CONFLICT_CONSTRAINT)
      return { ok: false, reason: "booking_conflict" };
    throw error;
  }
}

export const bookingLifecycleTestInternals = {
  runBookingLifecycleWithSerializationRetry,
  maxSerializationAttempts: MAX_SERIALIZATION_ATTEMPTS,
};
