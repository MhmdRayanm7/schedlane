import type { Transaction } from "kysely";
import { db } from "../../db.js";
import type { Database } from "../../db-types.js";
import { subtractIntervals } from "./interval-subtraction.js";
import { isoWeekdayFromLocalDate } from "./local-date.js";
import type { MinuteInterval } from "./minute-interval.js";
import { canManageResourceAvailability } from "./resource-availability-policy.js";
import {
  resolveAvailabilityLayers,
  type ScheduleOverride,
} from "./resource-schedule.js";

type ResolveResourceScheduleInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
  date: string;
};
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

function overrideFromRows(
  rows: { start_minute: number | null; end_minute: number | null }[],
): ScheduleOverride {
  // A left join preserves closed parents as one row with null interval columns.
  const intervals = rows.flatMap((row) =>
    row.start_minute === null || row.end_minute === null
      ? []
      : [{ startMinute: row.start_minute, endMinute: row.end_minute }],
  );
  return {
    mode:
      rows.length === 0
        ? "inherit"
        : intervals.length === 0
          ? "closed"
          : "custom",
    intervals,
  };
}

// Shared authorization and configured-layer loading; callers own the read snapshot.
async function resolveResourceScheduleInTransaction(
  trx: Transaction<Database>,
  input: ResolveResourceScheduleInput,
): Promise<ResolveResourceScheduleResult> {
  const memberships = await trx
    .selectFrom("membership")
    .select(["user_id", "role"])
    .where("organization_id", "=", input.organizationId)
    .execute();
  const actor = memberships.find((member) => member.user_id === input.userId);
  if (!actor) return { ok: false, reason: "organization_not_found" };
  const resource = await trx
    .selectFrom("resource")
    .select("user_id")
    .where("id", "=", input.resourceId)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirst();
  if (!resource) return { ok: false, reason: "resource_not_found" };
  if (!canManageResourceAvailability(actor, resource.user_id, memberships))
    return { ok: false, reason: "insufficient_role" };
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
        organizationWeekly: organizationWeekly.map((row) => ({
          startMinute: row.start_minute,
          endMinute: row.end_minute,
        })),
        resourceWeekly: overrideFromRows(resourceWeekly),
        organizationDate: overrideFromRows(organizationDate),
        resourceDate: overrideFromRows(resourceDate),
      }),
    },
  };
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
export async function resolveResourceWorkingWindowsForDate(
  input: ResolveResourceScheduleInput,
): Promise<ResolveResourceWorkingWindowsResult> {
  // Memberships, Resource, all four layers and blocks use this exact transaction snapshot.
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const result = await resolveResourceScheduleInTransaction(trx, input);
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
            blocks.map((block) => ({
              startMinute: block.start_minute,
              endMinute: block.end_minute,
            })),
          ),
        },
      };
    });
}
