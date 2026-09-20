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

type OrganizationAvailabilitySettingsInput = {
  userId: string;
  organizationId: string;
};

export type GetOrganizationAvailabilitySettingsResult =
  | {
      ok: true;
      settings: {
        slotIntervalMinutes: number;
        minBookingNoticeMinutes: number;
        maxBookingHorizonDays: number;
        publicBookingPaused: boolean;
        cancellationCutoffMinutes: number;
      };
    }
  | { ok: false; reason: "organization_not_found" | "insufficient_role" };

export async function getOrganizationAvailabilitySettings(
  input: OrganizationAvailabilitySettingsInput,
): Promise<GetOrganizationAvailabilitySettingsResult> {
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
      const organization = await trx
        .selectFrom("organization")
        .select([
          "slot_interval_minutes",
          "min_booking_notice_minutes",
          "max_booking_horizon_days",
          "public_booking_paused",
          "cancellation_cutoff_minutes",
        ])
        .where("id", "=", input.organizationId)
        .executeTakeFirst();
      if (!organization) return { ok: false, reason: "organization_not_found" };
      return {
        ok: true,
        settings: {
          slotIntervalMinutes: organization.slot_interval_minutes,
          minBookingNoticeMinutes: organization.min_booking_notice_minutes,
          maxBookingHorizonDays: organization.max_booking_horizon_days,
          publicBookingPaused: organization.public_booking_paused,
          cancellationCutoffMinutes: organization.cancellation_cutoff_minutes,
        },
      };
    });
}
