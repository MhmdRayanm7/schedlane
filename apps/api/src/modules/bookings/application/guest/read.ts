import type { Transaction } from "kysely";
import { db } from "../../../../db.js";
import type { BookingStatus, Database } from "../../../../db-types.js";
import { calculateGuestCancellationPolicy } from "../../domain/cancellation-policy.js";
import {
  hashGuestManagementToken,
  isGuestManagementToken,
} from "../../domain/management-token.js";
import { cloneValidOperationTime } from "../../domain/operation-time.js";

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
  canEditContact: boolean;
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
    canEditContact:
      row.status === "confirmed" && now.getTime() < row.start_at.getTime(),
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
  const currentTime = cloneValidOperationTime(
    now,
    "Guest Booking management now must be a valid Date",
  );
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
