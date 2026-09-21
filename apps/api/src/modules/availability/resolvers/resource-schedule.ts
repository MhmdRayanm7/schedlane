import type { Transaction } from "kysely";
import { db } from "../../../db.js";
import type { Database } from "../../../db-types.js";
import { authorizeResourceAvailabilityRead } from "../application/resource-access.js";
import { subtractIntervals } from "../domain/interval-subtraction.js";
import { isoWeekdayFromLocalDate } from "../domain/local-date.js";
import type { MinuteInterval } from "../domain/minute-interval.js";
import {
  projectScheduleOverride,
  toMinuteInterval,
} from "../domain/projections.js";
import { resolveAvailabilityLayers } from "../domain/resource-schedule.js";

export type ResolveResourceScheduleInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
  date: string;
};
export type ResolveResourceScheduleAfterAccessInput = Omit<
  ResolveResourceScheduleInput,
  "userId"
>;
export type ResolveResourceScheduleResult =
  | {
      ok: true;
      schedule: {
        timezone: "Asia/Jerusalem";
        resourceId: string;
        date: string;
        intervals: MinuteInterval[];
      };
    }
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | "resource_not_found"
        | "insufficient_role"
        | "invalid_date";
    };

export type ResolveResourceWorkingWindowsResult =
  | {
      ok: true;
      workingWindows: Extract<
        ResolveResourceScheduleResult,
        { ok: true }
      >["schedule"];
    }
  | Extract<ResolveResourceScheduleResult, { ok: false }>;

// Configured-layer loading after the caller has authorized Resource access.
async function resolveResourceScheduleAfterAccessInTransaction(
  trx: Transaction<Database>,
  input: ResolveResourceScheduleAfterAccessInput,
): Promise<ResolveResourceScheduleResult> {
  const weekday = isoWeekdayFromLocalDate(input.date);
  if (weekday === null) return { ok: false, reason: "invalid_date" };

  const organizationWeekly = await trx
    .selectFrom("organization_weekly_hours")
    .select(["start_minute", "end_minute"])
    .where("organization_id", "=", input.organizationId)
    .where("weekday", "=", weekday)
    .execute();
  const resourceWeekly = await trx
    .selectFrom("resource_weekly_hours_override as parent")
    .leftJoin("resource_weekly_hours_interval as interval", (join) =>
      join
        .onRef("interval.organization_id", "=", "parent.organization_id")
        .onRef("interval.resource_id", "=", "parent.resource_id")
        .onRef("interval.weekday", "=", "parent.weekday"),
    )
    .select(["interval.start_minute", "interval.end_minute"])
    .where("parent.organization_id", "=", input.organizationId)
    .where("parent.resource_id", "=", input.resourceId)
    .where("parent.weekday", "=", weekday)
    .execute();
  const organizationDate = await trx
    .selectFrom("organization_date_override as parent")
    .leftJoin("organization_date_override_interval as interval", (join) =>
      join
        .onRef("interval.organization_id", "=", "parent.organization_id")
        .onRef("interval.local_date", "=", "parent.local_date"),
    )
    .select(["interval.start_minute", "interval.end_minute"])
    .where("parent.organization_id", "=", input.organizationId)
    .where("parent.local_date", "=", input.date)
    .execute();
  const resourceDate = await trx
    .selectFrom("resource_date_override as parent")
    .leftJoin("resource_date_override_interval as interval", (join) =>
      join
        .onRef("interval.organization_id", "=", "parent.organization_id")
        .onRef("interval.resource_id", "=", "parent.resource_id")
        .onRef("interval.local_date", "=", "parent.local_date"),
    )
    .select(["interval.start_minute", "interval.end_minute"])
    .where("parent.organization_id", "=", input.organizationId)
    .where("parent.resource_id", "=", input.resourceId)
    .where("parent.local_date", "=", input.date)
    .execute();

  return {
    ok: true,
    schedule: {
      timezone: "Asia/Jerusalem",
      resourceId: input.resourceId,
      date: input.date,
      intervals: resolveAvailabilityLayers({
        organizationWeekly: organizationWeekly.map(toMinuteInterval),
        resourceWeekly: projectScheduleOverride(resourceWeekly),
        organizationDate: projectScheduleOverride(organizationDate),
        resourceDate: projectScheduleOverride(resourceDate),
      }),
    },
  };
}

// Shared authorization and configured-layer loading; callers own the read snapshot.
async function resolveResourceScheduleInTransaction(
  trx: Transaction<Database>,
  input: ResolveResourceScheduleInput,
): Promise<ResolveResourceScheduleResult> {
  const access = await authorizeResourceAvailabilityRead(trx, input);
  if (!access.ok) return access;
  return resolveResourceScheduleAfterAccessInTransaction(trx, input);
}

// Configured schedule only: Time Blocks do not affect this resolver.
export async function resolveResourceScheduleForDate(
  input: ResolveResourceScheduleInput,
): Promise<ResolveResourceScheduleResult> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute((trx) => resolveResourceScheduleInTransaction(trx, input));
}

// Working windows exclude Time Blocks; Bookings and Service/slot rules are not applied.
export async function resolveResourceWorkingWindowsInTransaction(
  trx: Transaction<Database>,
  input: ResolveResourceScheduleInput,
): Promise<ResolveResourceWorkingWindowsResult> {
  const access = await authorizeResourceAvailabilityRead(trx, input);
  if (!access.ok) return access;
  return resolveResourceWorkingWindowsAfterAccessInTransaction(trx, input);
}

// Working-window calculation for callers that own authorization and the transaction.
export async function resolveResourceWorkingWindowsAfterAccessInTransaction(
  trx: Transaction<Database>,
  input: ResolveResourceScheduleAfterAccessInput,
): Promise<ResolveResourceWorkingWindowsResult> {
  const result = await resolveResourceScheduleAfterAccessInTransaction(
    trx,
    input,
  );
  if (!result.ok) return result;
  const blocks = await trx
    .selectFrom("resource_time_block")
    .select(["start_minute", "end_minute"])
    .where("organization_id", "=", input.organizationId)
    .where("resource_id", "=", input.resourceId)
    .where("local_date", "=", input.date)
    .orderBy("start_minute", "asc")
    .orderBy("id", "asc")
    .execute();
  return {
    ok: true,
    workingWindows: {
      ...result.schedule,
      intervals: subtractIntervals(
        result.schedule.intervals,
        blocks.map(toMinuteInterval),
      ),
    },
  };
}

export async function resolveResourceWorkingWindowsForDate(
  input: ResolveResourceScheduleInput,
): Promise<ResolveResourceWorkingWindowsResult> {
  // Memberships, Resource, all four layers and blocks use this exact transaction snapshot.
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute((trx) => resolveResourceWorkingWindowsInTransaction(trx, input));
}
