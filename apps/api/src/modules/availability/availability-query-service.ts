import { db } from "../../db.js";
import {
  emptyWeeklyHours,
  type OrganizationWeeklyHours,
} from "./weekly-hours.js";

type GetOrganizationWeeklyHoursInput = {
  userId: string;
  organizationId: string;
};

export type GetOrganizationWeeklyHoursResult =
  | { ok: true; weeklyHours: OrganizationWeeklyHours }
  | { ok: false; reason: "organization_not_found" | "insufficient_role" };

export async function getOrganizationWeeklyHours(
  input: GetOrganizationWeeklyHoursInput,
): Promise<GetOrganizationWeeklyHoursResult> {
  const membership = await db
    .selectFrom("membership")
    .select("role")
    .where("organization_id", "=", input.organizationId)
    .where("user_id", "=", input.userId)
    .executeTakeFirst();
  if (!membership) return { ok: false, reason: "organization_not_found" };
  if (membership.role === "staff")
    return { ok: false, reason: "insufficient_role" };

  const rows = await db
    .selectFrom("organization_weekly_hours")
    .select(["weekday", "start_minute", "end_minute"])
    .where("organization_id", "=", input.organizationId)
    .orderBy("weekday")
    .orderBy("start_minute")
    .execute();
  const weeklyHours = emptyWeeklyHours();
  for (const day of weeklyHours.days) {
    day.intervals = rows
      .filter((row) => row.weekday === day.weekday)
      .map((row) => ({
        startMinute: row.start_minute,
        endMinute: row.end_minute,
      }));
  }
  return { ok: true, weeklyHours };
}
