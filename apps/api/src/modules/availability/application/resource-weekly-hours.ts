import { DatabaseError } from "pg";
import { db } from "../../../db.js";
import { lockOrganizationMemberships } from "../../organizations/application/membership-lock.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";
import { projectResourceWeeklyHours } from "../domain/projections.js";
import { canManageResourceAvailability } from "../domain/resource-availability-policy.js";
import {
  normalizeResourceWeeklyHours,
  type ResourceWeeklyHours,
  type ResourceWeeklyHoursDay,
} from "../domain/resource-weekly-hours.js";
import { authorizeResourceAvailabilityRead } from "./resource-access.js";

type ResourceWeeklyHoursInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
};
export type ResourceWeeklyHoursResult =
  | { ok: true; weeklyHours: ResourceWeeklyHours }
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | "resource_not_found"
        | "insufficient_role"
        | "invalid_weekly_hours"
        | OrganizationWriteStateFailure;
    };

export async function getResourceWeeklyHours(
  input: ResourceWeeklyHoursInput,
): Promise<ResourceWeeklyHoursResult> {
  // One snapshot keeps permissions, override days and intervals consistent during replacements.
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const access = await authorizeResourceAvailabilityRead(trx, input);
      if (!access.ok) return access;
      const overrides = await trx
        .selectFrom("resource_weekly_hours_override")
        .select("weekday")
        .where("organization_id", "=", input.organizationId)
        .where("resource_id", "=", input.resourceId)
        .execute();
      const intervals = await trx
        .selectFrom("resource_weekly_hours_interval")
        .select(["weekday", "start_minute", "end_minute"])
        .where("organization_id", "=", input.organizationId)
        .where("resource_id", "=", input.resourceId)
        .orderBy("start_minute")
        .execute();
      const weeklyHours = projectResourceWeeklyHours(
        input.resourceId,
        overrides,
        intervals,
      );
      return { ok: true, weeklyHours };
    });
}

export async function replaceResourceWeeklyHours(
  input: ResourceWeeklyHoursInput & { days: ResourceWeeklyHoursDay[] },
): Promise<ResourceWeeklyHoursResult> {
  try {
    return await db.transaction().execute(async (trx) => {
      // Memberships in deterministic order -> Organization -> tenant-scoped Resource.
      const memberships = await lockOrganizationMemberships(
        trx,
        input.organizationId,
      );
      const actor = memberships.find(
        (member) => member.user_id === input.userId,
      );
      if (!actor) return { ok: false, reason: "organization_not_found" };
      const writeState = await requireWritableOrganization(
        trx,
        input.organizationId,
      );
      if (!writeState.ok) return writeState;
      const resource = await trx
        .selectFrom("resource")
        .select("user_id")
        .where("id", "=", input.resourceId)
        .where("organization_id", "=", input.organizationId)
        .forUpdate()
        .executeTakeFirst();
      if (!resource) return { ok: false, reason: "resource_not_found" };
      if (!canManageResourceAvailability(actor, resource.user_id, memberships))
        return { ok: false, reason: "insufficient_role" };
      const weeklyHours = normalizeResourceWeeklyHours(
        input.resourceId,
        input.days,
      );
      if (!weeklyHours) return { ok: false, reason: "invalid_weekly_hours" };
      const overrides = weeklyHours.days
        .filter((day) => day.mode !== "inherit")
        .map((day) => ({
          organization_id: input.organizationId,
          resource_id: input.resourceId,
          weekday: day.weekday,
        }));
      const intervals = weeklyHours.days.flatMap((day) =>
        day.intervals.map((interval) => ({
          organization_id: input.organizationId,
          resource_id: input.resourceId,
          weekday: day.weekday,
          start_minute: interval.startMinute,
          end_minute: interval.endMinute,
        })),
      );
      await trx
        .deleteFrom("resource_weekly_hours_override")
        .where("organization_id", "=", input.organizationId)
        .where("resource_id", "=", input.resourceId)
        .execute();
      if (overrides.length)
        await trx
          .insertInto("resource_weekly_hours_override")
          .values(overrides)
          .execute();
      if (intervals.length)
        await trx
          .insertInto("resource_weekly_hours_interval")
          .values(intervals)
          .execute();
      return { ok: true, weeklyHours };
    });
  } catch (error) {
    // Translate validation constraints only after rollback restores both tables.
    if (
      error instanceof DatabaseError &&
      (error.table === "resource_weekly_hours_override" ||
        error.table === "resource_weekly_hours_interval") &&
      (error.code === "23P01" ||
        error.code === "23514" ||
        error.code === "23505")
    )
      return { ok: false, reason: "invalid_weekly_hours" };
    throw error;
  }
}
