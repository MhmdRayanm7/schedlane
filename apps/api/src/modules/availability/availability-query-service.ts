import { db } from "../../db.js";
import { projectOrganizationWeeklyHours } from "./availability-projections.js";
import type { OrganizationWeeklyHours } from "./weekly-hours.js";

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
      if (membership.role === "staff")
        return { ok: false, reason: "insufficient_role" };
      const rows = await trx
        .selectFrom("organization_weekly_hours")
        .select(["weekday", "start_minute", "end_minute"])
        .where("organization_id", "=", input.organizationId)
        .orderBy("weekday")
        .orderBy("start_minute")
        .execute();
      return { ok: true, weeklyHours: projectOrganizationWeeklyHours(rows) };
    });
}
