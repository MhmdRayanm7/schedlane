import type { Transaction } from "kysely";
import { db } from "../../../db.js";
import type { Database } from "../../../db-types.js";
import { filterSlotStartsByBookingOccupancy } from "../../availability/domain/booking-slot-occupancy.js";
import { isLocalDate } from "../../availability/domain/local-date.js";
import { resolveResourceServiceSnapshotSlotContextAfterAccessInTransaction } from "../../availability/resolvers/resource-service-slots.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";
import { cloneValidOperationTime } from "../domain/operation-time.js";
import { canManageBookingForResource } from "../domain/policy.js";
import {
  calculateBookingTemporalSnapshot,
  localBookingStartToUtc,
  SCHEDULING_TIMEZONE,
} from "../domain/time.js";

export type GetBookingRescheduleOptionsInput = {
  userId: string;
  organizationId: string;
  bookingId: string;
  date: string;
  resourceId?: string;
};

export type BookingRescheduleOptions = {
  timezone: typeof SCHEDULING_TIMEZONE;
  bookingId: string;
  serviceId: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  date: string;
  selectedResourceId: string | null;
  resources: Array<{ id: string; name: string }>;
  starts: number[];
};

type GetBookingRescheduleOptionsFailure =
  | "organization_not_found"
  | OrganizationWriteStateFailure
  | "booking_not_found"
  | "insufficient_role"
  | "invalid_booking_status"
  | "resource_not_found"
  | "resource_inactive"
  | "service_not_found"
  | "service_not_assigned"
  | "invalid_date";

export type GetBookingRescheduleOptionsResult =
  | { ok: true; options: BookingRescheduleOptions }
  | { ok: false; reason: GetBookingRescheduleOptionsFailure };

type EligibleResource = {
  id: string;
  name: string;
  userId: string | null;
};

async function resolveSelectedResourceFailure(
  trx: Transaction<Database>,
  input: GetBookingRescheduleOptionsInput,
  serviceId: string,
  actor: { userId: string; role: "owner" | "manager" | "staff" },
): Promise<Extract<GetBookingRescheduleOptionsResult, { ok: false }>> {
  const target = await trx
    .selectFrom("resource")
    .select(["id", "user_id", "deactivated_at"])
    .where("id", "=", input.resourceId as string)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirst();
  if (!target) return { ok: false, reason: "resource_not_found" };
  if (target.deactivated_at) return { ok: false, reason: "resource_inactive" };
  if (!canManageBookingForResource(actor, target.user_id))
    return { ok: false, reason: "insufficient_role" };
  const assignment = await trx
    .selectFrom("resource_service")
    .select("resource_id")
    .where("organization_id", "=", input.organizationId)
    .where("resource_id", "=", target.id)
    .where("service_id", "=", serviceId)
    .executeTakeFirst();
  return {
    ok: false,
    reason: assignment ? "resource_not_found" : "service_not_assigned",
  };
}

async function getOptionsInTransaction(
  trx: Transaction<Database>,
  input: GetBookingRescheduleOptionsInput,
  now: Date,
): Promise<GetBookingRescheduleOptionsResult> {
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
    .executeTakeFirst();
  if (!booking) return { ok: false, reason: "booking_not_found" };

  const sourceResource = await trx
    .selectFrom("resource")
    .select("user_id")
    .where("id", "=", booking.resource_id)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirstOrThrow();
  const actor = { userId: input.userId, role: membership.role };
  if (!canManageBookingForResource(actor, sourceResource.user_id))
    return { ok: false, reason: "insufficient_role" };
  if (booking.status !== "confirmed")
    return { ok: false, reason: "invalid_booking_status" };

  const resourceRows = await trx
    .selectFrom("resource")
    .innerJoin("resource_service", (join) =>
      join
        .onRef("resource_service.resource_id", "=", "resource.id")
        .onRef(
          "resource_service.organization_id",
          "=",
          "resource.organization_id",
        ),
    )
    .select(["resource.id", "resource.name", "resource.user_id"])
    .where("resource.organization_id", "=", input.organizationId)
    .where("resource_service.service_id", "=", booking.service_id)
    .where("resource.deactivated_at", "is", null)
    .orderBy("resource.name", "asc")
    .orderBy("resource.id", "asc")
    .execute();
  const eligibleResources: EligibleResource[] = resourceRows
    .filter((resource) => canManageBookingForResource(actor, resource.user_id))
    .map((resource) => ({
      id: resource.id,
      name: resource.name,
      userId: resource.user_id,
    }));

  const selectedResource = input.resourceId
    ? eligibleResources.find((resource) => resource.id === input.resourceId)
    : (eligibleResources.find(
        (resource) => resource.id === booking.resource_id,
      ) ?? eligibleResources[0]);
  if (input.resourceId && !selectedResource)
    return resolveSelectedResourceFailure(
      trx,
      input,
      booking.service_id,
      actor,
    );
  if (!isLocalDate(input.date)) return { ok: false, reason: "invalid_date" };

  const resources = eligibleResources.map(({ id, name }) => ({ id, name }));
  if (!selectedResource)
    return {
      ok: true,
      options: {
        timezone: SCHEDULING_TIMEZONE,
        bookingId: booking.id,
        serviceId: booking.service_id,
        durationMinutes: booking.duration_minutes,
        bufferAfterMinutes: booking.buffer_after_minutes,
        date: input.date,
        selectedResourceId: null,
        resources,
        starts: [],
      },
    };

  const configured =
    await resolveResourceServiceSnapshotSlotContextAfterAccessInTransaction(
      trx,
      {
        organizationId: input.organizationId,
        resourceId: selectedResource.id,
        serviceId: booking.service_id,
        date: input.date,
        durationMinutes: booking.duration_minutes,
        bufferAfterMinutes: booking.buffer_after_minutes,
      },
    );
  if (!configured.ok) return configured;

  const candidates = configured.context.starts.flatMap((startMinute) => {
    const startAt = localBookingStartToUtc(input.date, startMinute);
    if (!startAt || startAt < now) return [];
    const { occupiedUntilAt } = calculateBookingTemporalSnapshot(
      startAt,
      booking.duration_minutes,
      booking.buffer_after_minutes,
    );
    return [{ startMinute, startAt, occupiedUntilAt }];
  });
  let starts: number[] = [];
  if (candidates.length > 0) {
    const earliestStart = new Date(
      Math.min(...candidates.map((candidate) => candidate.startAt.getTime())),
    );
    const latestEnd = new Date(
      Math.max(
        ...candidates.map((candidate) => candidate.occupiedUntilAt.getTime()),
      ),
    );
    const occupancy = await trx
      .selectFrom("booking")
      .select(["start_at", "occupied_until_at"])
      .where("organization_id", "=", input.organizationId)
      .where("resource_id", "=", selectedResource.id)
      .where("status", "=", "confirmed")
      .where("id", "!=", booking.id)
      .where("start_at", "<", latestEnd)
      .where("occupied_until_at", ">", earliestStart)
      .orderBy("start_at", "asc")
      .orderBy("occupied_until_at", "asc")
      .execute();
    const filtered = filterSlotStartsByBookingOccupancy(
      candidates,
      occupancy.map((item) => ({
        startAt: item.start_at,
        occupiedUntilAt: item.occupied_until_at,
      })),
    );
    if (filtered === null)
      throw new Error("Persisted Booking occupancy violated domain invariants");
    starts = filtered;
  }

  return {
    ok: true,
    options: {
      timezone: configured.context.timezone,
      bookingId: booking.id,
      serviceId: booking.service_id,
      durationMinutes: booking.duration_minutes,
      bufferAfterMinutes: booking.buffer_after_minutes,
      date: input.date,
      selectedResourceId: selectedResource.id,
      resources,
      starts,
    },
  };
}

export async function getBookingRescheduleOptions(
  input: GetBookingRescheduleOptionsInput,
  now: Date = new Date(),
): Promise<GetBookingRescheduleOptionsResult> {
  const operationNow = cloneValidOperationTime(
    now,
    "Booking reschedule options now must be a valid Date",
  );
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute((trx) => getOptionsInTransaction(trx, input, operationNow));
}
