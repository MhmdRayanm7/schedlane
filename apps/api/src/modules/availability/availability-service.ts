import { DatabaseError } from "pg";
import { db } from "../../db.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../organizations/organization-write-policy.js";
import {
  normalizeWeeklyHours,
  type OrganizationWeeklyHours,
  type WeeklyHoursDay,
} from "./weekly-hours.js";

type ReplaceOrganizationWeeklyHoursInput = {
  userId: string;
  organizationId: string;
  days: WeeklyHoursDay[];
};

export type ReplaceOrganizationWeeklyHoursResult =
  | { ok: true; weeklyHours: OrganizationWeeklyHours }
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | "insufficient_role"
        | "invalid_weekly_hours"
        | OrganizationWriteStateFailure;
    };

export async function replaceOrganizationWeeklyHours(
  input: ReplaceOrganizationWeeklyHoursInput,
): Promise<ReplaceOrganizationWeeklyHoursResult> {
  try {
    return await db.transaction().execute(async (trx) => {
      // Lock actor membership -> Organization; the Organization serializes replacements.
      const membership = await trx
        .selectFrom("membership")
        .select("role")
        .where("organization_id", "=", input.organizationId)
        .where("user_id", "=", input.userId)
        .forUpdate()
        .executeTakeFirst();
      if (!membership) return { ok: false, reason: "organization_not_found" };
      if (membership.role === "staff")
        return { ok: false, reason: "insufficient_role" };
      const writeState = await requireWritableOrganization(
        trx,
        input.organizationId,
      );
      if (!writeState.ok) return writeState;

      const weeklyHours = normalizeWeeklyHours(input.days);
      if (!weeklyHours) return { ok: false, reason: "invalid_weekly_hours" };
      const rows = weeklyHours.days.flatMap((day) =>
        day.intervals.map((interval) => ({
          organization_id: input.organizationId,
          weekday: day.weekday,
          start_minute: interval.startMinute,
          end_minute: interval.endMinute,
        })),
      );

      await trx
        .deleteFrom("organization_weekly_hours")
        .where("organization_id", "=", input.organizationId)
        .execute();
      if (rows.length > 0) {
        await trx
          .insertInto("organization_weekly_hours")
          .values(rows)
          .execute();
      }
      return { ok: true, weeklyHours };
    });
  } catch (error) {
    // Catch only after the transaction rolls back, preserving the previous schedule.
    if (
      error instanceof DatabaseError &&
      error.table === "organization_weekly_hours" &&
      (error.code === "23P01" ||
        error.code === "23514" ||
        error.code === "23505")
    ) {
      return { ok: false, reason: "invalid_weekly_hours" };
    }
    throw error;
  }
}
