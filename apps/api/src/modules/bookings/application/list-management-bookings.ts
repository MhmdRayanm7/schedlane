import { db } from "../../../db.js";
import type { BookingStatus } from "../../../db-types.js";
import {
  localBookingDateRangeToUtc,
  SCHEDULING_TIMEZONE,
} from "../domain/time.js";

export type ListManagementBookingsInput = {
  userId: string;
  organizationId: string;
  fromDate: string;
  toDate: string;
};

export type ManagementBooking = {
  id: string;
  publicReference: string;
  status: BookingStatus;
  resourceId: string;
  resourceName: string;
  serviceId: string;
  serviceName: string;
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
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListManagementBookingsResult =
  | {
      ok: true;
      schedule: {
        timezone: typeof SCHEDULING_TIMEZONE;
        fromDate: string;
        toDate: string;
        bookings: ManagementBooking[];
      };
    }
  | { ok: false; reason: "organization_not_found" | "invalid_date_range" };

export async function listManagementBookings(
  input: ListManagementBookingsInput,
): Promise<ListManagementBookingsResult> {
  const range = localBookingDateRangeToUtc(input.fromDate, input.toDate);
  if (!range) return { ok: false, reason: "invalid_date_range" };

  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const membership = await trx
        .selectFrom("membership")
        .select("role")
        .where("organization_id", "=", input.organizationId)
        .where("user_id", "=", input.userId)
        .executeTakeFirst();
      if (!membership) return { ok: false, reason: "organization_not_found" };

      let staffResourceId: string | null = null;
      if (membership.role === "staff") {
        const resource = await trx
          .selectFrom("resource")
          .select("id")
          .where("organization_id", "=", input.organizationId)
          .where("user_id", "=", input.userId)
          .executeTakeFirst();
        if (!resource)
          return {
            ok: true,
            schedule: {
              timezone: SCHEDULING_TIMEZONE,
              fromDate: input.fromDate,
              toDate: input.toDate,
              bookings: [],
            },
          };
        staffResourceId = resource.id;
      }

      const scopedResourceId = staffResourceId;
      const rows = await trx
        .selectFrom("booking")
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
          "booking.id",
          "booking.public_reference",
          "booking.status",
          "booking.resource_id",
          "resource.name as resource_name",
          "booking.service_id",
          "service.name as service_name",
          "booking.start_at",
          "booking.service_end_at",
          "booking.occupied_until_at",
          "booking.duration_minutes",
          "booking.buffer_after_minutes",
          "booking.price_agorot",
          "booking.guest_name",
          "booking.guest_phone",
          "booking.guest_email",
          "booking.customer_note",
          "booking.cancelled_at",
          "booking.cancellation_reason",
          "booking.created_at",
          "booking.updated_at",
        ])
        .where("booking.organization_id", "=", input.organizationId)
        .where("booking.start_at", ">=", range.startAt)
        .where("booking.start_at", "<", range.endExclusiveAt)
        .$if(scopedResourceId !== null, (query) =>
          query.where("booking.resource_id", "=", scopedResourceId),
        )
        .orderBy("booking.start_at", "asc")
        .orderBy("booking.id", "asc")
        .execute();

      return {
        ok: true,
        schedule: {
          timezone: SCHEDULING_TIMEZONE,
          fromDate: input.fromDate,
          toDate: input.toDate,
          bookings: rows.map((row) => ({
            id: row.id,
            publicReference: row.public_reference,
            status: row.status,
            resourceId: row.resource_id,
            resourceName: row.resource_name,
            serviceId: row.service_id,
            serviceName: row.service_name,
            startAt: row.start_at.toISOString(),
            serviceEndAt: row.service_end_at.toISOString(),
            occupiedUntilAt: row.occupied_until_at.toISOString(),
            durationMinutes: row.duration_minutes,
            bufferAfterMinutes: row.buffer_after_minutes,
            priceAgorot: row.price_agorot,
            guestName: row.guest_name,
            guestPhone: row.guest_phone,
            guestEmail: row.guest_email,
            customerNote: row.customer_note,
            cancelledAt: row.cancelled_at?.toISOString() ?? null,
            cancellationReason: row.cancellation_reason,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
          })),
        },
      };
    });
}
