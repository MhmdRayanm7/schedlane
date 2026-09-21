import type { Transaction } from "kysely";
import { db } from "../../../../db.js";
import type { BookingStatus, Database } from "../../../../db-types.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../../organizations/application/write-policy.js";
import { calculateGuestCancellationPolicy } from "../../domain/cancellation-policy.js";
import {
  normalizeGuestEmail,
  normalizeGuestName,
  normalizeIsraeliGuestPhone,
} from "../../domain/guest-contact.js";
import {
  hashGuestManagementToken,
  isGuestManagementToken,
} from "../../domain/management-token.js";

const MAX_SERIALIZATION_ATTEMPTS = 3;

export type GuestManagedBooking = {
  publicReference: string;
  status: BookingStatus;
  organizationName: string;
  resourceName: string;
  serviceName: string;
  startAt: string;
  serviceEndAt: string;
  durationMinutes: number;
  priceAgorot: number | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  customerNote: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancellationDeadlineAt: string;
  canCancel: boolean;
};

export type GetGuestManagedBookingResult =
  | { ok: true; booking: GuestManagedBooking }
  | { ok: false; reason: "guest_booking_not_found" };

type GuestBookingRow = {
  public_reference: string;
  status: BookingStatus;
  organization_name: string;
  resource_name: string;
  service_name: string;
  start_at: Date;
  service_end_at: Date;
  duration_minutes: number;
  price_agorot: number | null;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  customer_note: string | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  cancellation_cutoff_minutes: number;
};

function operationNow(now: Date): Date {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error("Guest Booking management now must be a valid Date");
  return new Date(now.getTime());
}

function toGuestManagedBooking(
  row: GuestBookingRow,
  now: Date,
): GuestManagedBooking {
  const policy = calculateGuestCancellationPolicy({
    status: row.status,
    startAt: row.start_at,
    cancellationCutoffMinutes: row.cancellation_cutoff_minutes,
    now,
  });
  return {
    publicReference: row.public_reference,
    status: row.status,
    organizationName: row.organization_name,
    resourceName: row.resource_name,
    serviceName: row.service_name,
    startAt: row.start_at.toISOString(),
    serviceEndAt: row.service_end_at.toISOString(),
    durationMinutes: row.duration_minutes,
    priceAgorot: row.price_agorot,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    guestEmail: row.guest_email,
    customerNote: row.customer_note,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    cancellationReason: row.cancellation_reason,
    cancellationDeadlineAt: policy.cancellationDeadlineAt.toISOString(),
    canCancel: policy.canCancel,
  };
}

function guestBookingQuery(trx: Transaction<Database>) {
  return trx
    .selectFrom("booking")
    .innerJoin("organization", "organization.id", "booking.organization_id")
    .innerJoin("resource", (join) =>
      join
        .onRef("resource.id", "=", "booking.resource_id")
        .onRef("resource.organization_id", "=", "booking.organization_id"),
    )
    .innerJoin("service", (join) =>
      join
        .onRef("service.id", "=", "booking.service_id")
        .onRef("service.organization_id", "=", "booking.organization_id"),
    )
    .select([
      "booking.public_reference",
      "booking.status",
      "organization.name as organization_name",
      "resource.name as resource_name",
      "service.name as service_name",
      "booking.start_at",
      "booking.service_end_at",
      "booking.duration_minutes",
      "booking.price_agorot",
      "booking.guest_name",
      "booking.guest_phone",
      "booking.guest_email",
      "booking.customer_note",
      "booking.cancelled_at",
      "booking.cancellation_reason",
      "booking.cancellation_cutoff_minutes",
    ]);
}

export async function getGuestManagedBooking(
  token: string,
  now: Date = new Date(),
): Promise<GetGuestManagedBookingResult> {
  const currentTime = operationNow(now);
  if (!isGuestManagementToken(token))
    return { ok: false, reason: "guest_booking_not_found" };
  const tokenHash = hashGuestManagementToken(token);
  const row = await db
    .transaction()
    .execute((trx) =>
      guestBookingQuery(trx)
        .where("booking.guest_management_token_hash", "=", tokenHash)
        .executeTakeFirst(),
    );
  if (!row) return { ok: false, reason: "guest_booking_not_found" };
  return { ok: true, booking: toGuestManagedBooking(row, currentTime) };
}

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

function databaseError(error: unknown): { code?: string } {
  return typeof error === "object" && error !== null
    ? (error as { code?: string })
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
  throw new Error("Guest Booking management transaction did not complete");
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
  const currentTime = operationNow(now);
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
    .select(["id", "status", "start_at", "cancellation_cutoff_minutes"])
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
  const currentTime = operationNow(now);
  if (!isGuestManagementToken(input.token))
    return { ok: false, reason: "guest_booking_not_found" };
  const tokenHash = hashGuestManagementToken(input.token);
  const normalizedReason = input.reason?.trim() || null;
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
