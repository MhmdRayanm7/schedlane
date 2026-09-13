import { db } from "../../db.js";
import { canManageResourceAvailability } from "./resource-availability-policy.js";
import {
  isoWeekdayFromLocalDate,
  resolveAvailabilityLayers,
  type ScheduleOverride,
} from "./resource-schedule.js";
import type { WeeklyHoursDay } from "./weekly-hours.js";

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
        intervals: WeeklyHoursDay["intervals"];
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

export async function resolveResourceScheduleForDate(
  input: ResolveResourceScheduleInput,
): Promise<ResolveResourceScheduleResult> {
  // Every authorization and layer query uses this same snapshot; no write locks or mutations.
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const memberships = await trx
        .selectFrom("membership")
        .select(["user_id", "role"])
        .where("organization_id", "=", input.organizationId)
        .execute();
      const actor = memberships.find(
        (member) => member.user_id === input.userId,
      );
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
    });
}
