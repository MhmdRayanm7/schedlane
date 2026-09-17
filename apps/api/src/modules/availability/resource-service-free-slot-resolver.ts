import type { Transaction } from "kysely";
import { db } from "../../db.js";
import type { Database } from "../../db-types.js";
import {
  calculateBookingTemporalSnapshot,
  localBookingStartToUtc,
} from "../bookings/booking-time.js";
import { filterSlotStartsByBookingOccupancy } from "./booking-slot-occupancy.js";
import { authorizeResourceAvailabilityRead } from "./resource-availability-read-access.js";
import {
  type ResolveResourceServiceSlotContextAfterAccessInput,
  type ResolveResourceServiceSlotContextAfterAccessResult,
  type ResolveResourceServiceSlotStartsInput,
  resolveResourceServiceSlotContextAfterAccessInTransaction,
} from "./resource-service-slot-resolver.js";

type ConfiguredSlotContext = Extract<
  ResolveResourceServiceSlotContextAfterAccessResult,
  { ok: true }
>["context"];
type ConfiguredSlotFailure = Extract<
  ResolveResourceServiceSlotContextAfterAccessResult,
  { ok: false }
>;

export type ResolveResourceServiceFreeSlotContextAfterAccessResult =
  | { ok: true; context: ConfiguredSlotContext }
  | ConfiguredSlotFailure;

export type ResolveResourceServiceFreeSlotStartsResult =
  | {
      ok: true;
      slots: {
        timezone: "Asia/Jerusalem";
        resourceId: string;
        serviceId: string;
        date: string;
        starts: number[];
      };
    }
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | "resource_not_found"
        | "insufficient_role"
        | ConfiguredSlotFailure["reason"];
    };

// The caller owns authorization and the transaction snapshot.
export async function resolveResourceServiceFreeSlotContextAfterAccessInTransaction(
  trx: Transaction<Database>,
  input: ResolveResourceServiceSlotContextAfterAccessInput,
): Promise<ResolveResourceServiceFreeSlotContextAfterAccessResult> {
  const configured =
    await resolveResourceServiceSlotContextAfterAccessInTransaction(trx, input);
  if (!configured.ok) return configured;

  // Display resolution omits an ambiguous/nonexistent wall time while retaining
  // other valid starts. A write requesting that exact time rejects it instead.
  const candidates = configured.context.starts.flatMap((startMinute) => {
    const startAt = localBookingStartToUtc(input.date, startMinute);
    if (!startAt) return [];
    const { occupiedUntilAt } = calculateBookingTemporalSnapshot(
      startAt,
      configured.context.durationMinutes,
      configured.context.bufferAfterMinutes,
    );
    return [{ startMinute, startAt, occupiedUntilAt }];
  });
  if (candidates.length === 0)
    return {
      ok: true,
      context: { ...configured.context, starts: [] },
    };

  const earliestCandidateStartAt = new Date(
    Math.min(...candidates.map((candidate) => candidate.startAt.getTime())),
  );
  const latestCandidateOccupiedUntilAt = new Date(
    Math.max(
      ...candidates.map((candidate) => candidate.occupiedUntilAt.getTime()),
    ),
  );
  const occupiedBookings = await trx
    .selectFrom("booking")
    .select(["start_at", "occupied_until_at"])
    .where("organization_id", "=", input.organizationId)
    .where("resource_id", "=", input.resourceId)
    .where("status", "=", "confirmed")
    .where("start_at", "<", latestCandidateOccupiedUntilAt)
    .where("occupied_until_at", ">", earliestCandidateStartAt)
    .orderBy("start_at", "asc")
    .orderBy("occupied_until_at", "asc")
    .execute();
  const starts = filterSlotStartsByBookingOccupancy(
    candidates,
    occupiedBookings.map((booking) => ({
      startAt: booking.start_at,
      occupiedUntilAt: booking.occupied_until_at,
    })),
  );
  if (starts === null)
    throw new Error("Persisted Booking occupancy violated domain invariants");

  return {
    ok: true,
    context: { ...configured.context, starts },
  };
}

export async function resolveResourceServiceFreeSlotStartsForDate(
  input: ResolveResourceServiceSlotStartsInput,
): Promise<ResolveResourceServiceFreeSlotStartsResult> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const access = await authorizeResourceAvailabilityRead(trx, input);
      if (!access.ok) return access;
      const result =
        await resolveResourceServiceFreeSlotContextAfterAccessInTransaction(
          trx,
          input,
        );
      if (!result.ok) return result;
      return {
        ok: true,
        slots: {
          timezone: result.context.timezone,
          resourceId: result.context.resourceId,
          serviceId: result.context.serviceId,
          date: result.context.date,
          starts: result.context.starts,
        },
      };
    });
}
