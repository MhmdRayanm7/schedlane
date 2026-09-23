import type { Transaction } from "kysely";
import { db } from "../../../../db.js";
import type { Database } from "../../../../db-types.js";
import { insertOutboxEventInTransaction } from "../../../../outbox/persistence.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../../organizations/application/write-policy.js";
import { calculateGuestCancellationPolicy } from "../../domain/cancellation-policy.js";
import { normalizeCancellationReason } from "../../domain/cancellation-reason.js";
import {
  bookingEventType,
  createBookingCancelledEventPayload,
} from "../../domain/events.js";
import {
  normalizeGuestEmail,
  normalizeGuestName,
  normalizeIsraeliGuestPhone,
} from "../../domain/guest-contact.js";
import {
  hashGuestManagementToken,
  isGuestManagementToken,
} from "../../domain/management-token.js";
import { cloneValidOperationTime } from "../../domain/operation-time.js";
import {
  MAX_SERIALIZATION_ATTEMPTS,
  runWithSerializationRetry as runSerializableOperation,
} from "../../persistence/serializable-retry.js";

export type CancelGuestManagedBookingResult =
  | {
      ok: true;
      booking: {
        publicReference: string;
        status: "cancelled";
        cancelledAt: string;
        cancellationReason: string | null;
      };
    }
  | {
      ok: false;
      reason:
        | "guest_booking_not_found"
        | "invalid_booking_status"
        | "cancellation_cutoff_passed"
        | OrganizationWriteStateFailure;
    };

export type UpdateGuestManagedBookingContactInput = {
  token: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string | null;
};

export type UpdateGuestManagedBookingContactResult =
  | {
      ok: true;
      booking: {
        publicReference: string;
        guestName: string;
        guestPhone: string | null;
        guestEmail: string | null;
        updatedAt: string;
      };
    }
  | {
      ok: false;
      reason:
        | "guest_booking_not_found"
        | "invalid_guest_name"
        | "invalid_guest_phone"
        | "invalid_booking_status"
        | "guest_contact_edit_closed"
        | OrganizationWriteStateFailure;
    };

function runWithSerializationRetry<Result>(
  attempt: () => Promise<Result>,
): Promise<Result> {
  return runSerializableOperation(
    attempt,
    "Guest Booking management transaction did not complete",
  );
}

async function updateGuestBookingContactInTransaction(
  trx: Transaction<Database>,
  tokenHash: string,
  input: Omit<UpdateGuestManagedBookingContactInput, "token">,
  now: Date,
): Promise<UpdateGuestManagedBookingContactResult> {
  const identity = await trx
    .selectFrom("booking")
    .select(["id", "organization_id"])
    .where("guest_management_token_hash", "=", tokenHash)
    .executeTakeFirst();
  if (!identity) return { ok: false, reason: "guest_booking_not_found" };

  const writeState = await requireWritableOrganization(
    trx,
    identity.organization_id,
  );
  if (!writeState.ok) return writeState;

  const booking = await trx
    .selectFrom("booking")
    .select(["id", "status", "start_at"])
    .where("id", "=", identity.id)
    .where("organization_id", "=", identity.organization_id)
    .where("guest_management_token_hash", "=", tokenHash)
    .forUpdate()
    .executeTakeFirst();
  if (!booking) return { ok: false, reason: "guest_booking_not_found" };
  if (booking.status !== "confirmed")
    return { ok: false, reason: "invalid_booking_status" };
  if (now.getTime() >= booking.start_at.getTime())
    return { ok: false, reason: "guest_contact_edit_closed" };

  const guestName =
    input.guestName === undefined
      ? undefined
      : normalizeGuestName(input.guestName);
  if (guestName && !guestName.ok) return guestName;
  const guestPhone =
    input.guestPhone === undefined
      ? undefined
      : normalizeIsraeliGuestPhone(input.guestPhone);
  if (guestPhone && !guestPhone.ok) return guestPhone;

  const row = await trx
    .updateTable("booking")
    .set({
      ...(guestName ? { guest_name: guestName.guestName } : {}),
      ...(guestPhone ? { guest_phone: guestPhone.guestPhone } : {}),
      ...(input.guestEmail !== undefined
        ? { guest_email: normalizeGuestEmail(input.guestEmail) }
        : {}),
      updated_at: now,
    })
    .where("id", "=", booking.id)
    .where("organization_id", "=", identity.organization_id)
    .returning([
      "public_reference",
      "guest_name",
      "guest_phone",
      "guest_email",
      "updated_at",
    ])
    .executeTakeFirstOrThrow();
  return {
    ok: true,
    booking: {
      publicReference: row.public_reference,
      guestName: row.guest_name,
      guestPhone: row.guest_phone,
      guestEmail: row.guest_email,
      updatedAt: row.updated_at.toISOString(),
    },
  };
}

export async function updateGuestManagedBookingContact(
  input: UpdateGuestManagedBookingContactInput,
  now: Date = new Date(),
): Promise<UpdateGuestManagedBookingContactResult> {
  const currentTime = cloneValidOperationTime(
    now,
    "Guest Booking management now must be a valid Date",
  );
  if (!isGuestManagementToken(input.token))
    return { ok: false, reason: "guest_booking_not_found" };
  if (
    input.guestName === undefined &&
    input.guestPhone === undefined &&
    input.guestEmail === undefined
  )
    throw new Error("Guest contact update requires at least one field");
  const tokenHash = hashGuestManagementToken(input.token);
  const { token: _token, ...contact } = input;
  return runWithSerializationRetry(() =>
    db
      .transaction()
      .setIsolationLevel("serializable")
      .execute((trx) =>
        updateGuestBookingContactInTransaction(
          trx,
          tokenHash,
          contact,
          currentTime,
        ),
      ),
  );
}

async function cancelGuestBookingInTransaction(
  trx: Transaction<Database>,
  tokenHash: string,
  reason: string | null,
  now: Date,
): Promise<CancelGuestManagedBookingResult> {
  const identity = await trx
    .selectFrom("booking")
    .select(["id", "organization_id"])
    .where("guest_management_token_hash", "=", tokenHash)
    .executeTakeFirst();
  if (!identity) return { ok: false, reason: "guest_booking_not_found" };

  const writeState = await requireWritableOrganization(
    trx,
    identity.organization_id,
  );
  if (!writeState.ok) return writeState;

  const booking = await trx
    .selectFrom("booking")
    .select([
      "id",
      "status",
      "public_reference",
      "organization_id",
      "resource_id",
      "service_id",
      "start_at",
      "guest_name",
      "guest_phone",
      "guest_email",
      "cancellation_cutoff_minutes",
    ])
    .where("id", "=", identity.id)
    .where("organization_id", "=", identity.organization_id)
    .where("guest_management_token_hash", "=", tokenHash)
    .forUpdate()
    .executeTakeFirst();
  if (!booking) return { ok: false, reason: "guest_booking_not_found" };
  if (booking.status !== "confirmed")
    return { ok: false, reason: "invalid_booking_status" };
  const policy = calculateGuestCancellationPolicy({
    status: booking.status,
    startAt: booking.start_at,
    cancellationCutoffMinutes: booking.cancellation_cutoff_minutes,
    now,
  });
  if (!policy.canCancel)
    return { ok: false, reason: "cancellation_cutoff_passed" };

  const row = await trx
    .updateTable("booking")
    .set({
      status: "cancelled",
      cancelled_at: now,
      cancelled_by_user_id: null,
      cancellation_reason: reason,
      updated_at: now,
    })
    .where("id", "=", booking.id)
    .where("organization_id", "=", identity.organization_id)
    .returning([
      "public_reference",
      "status",
      "cancelled_at",
      "cancellation_reason",
    ])
    .executeTakeFirstOrThrow();
  if (row.status !== "cancelled" || !row.cancelled_at)
    throw new Error("Guest cancellation did not persist as cancelled");
  await insertOutboxEventInTransaction(trx, {
    aggregateType: "booking",
    aggregateId: booking.id,
    eventType: bookingEventType.cancelled,
    payload: createBookingCancelledEventPayload({
      id: booking.id,
      organizationId: booking.organization_id,
      publicReference: booking.public_reference,
      resourceId: booking.resource_id,
      serviceId: booking.service_id,
      startAt: booking.start_at,
      guestName: booking.guest_name,
      guestPhone: booking.guest_phone,
      guestEmail: booking.guest_email,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      cancelledBy: "guest",
    }),
    occurredAt: now,
  });
  return {
    ok: true,
    booking: {
      publicReference: row.public_reference,
      status: row.status,
      cancelledAt: row.cancelled_at.toISOString(),
      cancellationReason: row.cancellation_reason,
    },
  };
}

export async function cancelGuestManagedBooking(
  input: { token: string; reason?: string | null },
  now: Date = new Date(),
): Promise<CancelGuestManagedBookingResult> {
  const currentTime = cloneValidOperationTime(
    now,
    "Guest Booking management now must be a valid Date",
  );
  if (!isGuestManagementToken(input.token))
    return { ok: false, reason: "guest_booking_not_found" };
  const tokenHash = hashGuestManagementToken(input.token);
  const normalizedReason = normalizeCancellationReason(input.reason);
  return runWithSerializationRetry(() =>
    db
      .transaction()
      .setIsolationLevel("serializable")
      .execute((trx) =>
        cancelGuestBookingInTransaction(
          trx,
          tokenHash,
          normalizedReason,
          currentTime,
        ),
      ),
  );
}

export const guestBookingManagementTestInternals = {
  runWithSerializationRetry,
  maxSerializationAttempts: MAX_SERIALIZATION_ATTEMPTS,
};
