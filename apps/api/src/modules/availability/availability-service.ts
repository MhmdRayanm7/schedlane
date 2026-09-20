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

type UpdateOrganizationAvailabilitySettingsInput = {
  userId: string;
  organizationId: string;
  slotIntervalMinutes?: number;
  minBookingNoticeMinutes?: number;
  maxBookingHorizonDays?: number;
  publicBookingPaused?: boolean;
  cancellationCutoffMinutes?: number;
};

export type UpdateOrganizationAvailabilitySettingsResult =
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
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | "insufficient_role"
        | OrganizationWriteStateFailure;
    };

export async function updateOrganizationAvailabilitySettings(
  input: UpdateOrganizationAvailabilitySettingsInput,
): Promise<UpdateOrganizationAvailabilitySettingsResult> {
  return db.transaction().execute(async (trx) => {
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
    const organization = await trx
      .updateTable("organization")
      .set({
        ...(input.slotIntervalMinutes === undefined
          ? {}
          : { slot_interval_minutes: input.slotIntervalMinutes }),
        ...(input.minBookingNoticeMinutes === undefined
          ? {}
          : { min_booking_notice_minutes: input.minBookingNoticeMinutes }),
        ...(input.maxBookingHorizonDays === undefined
          ? {}
          : { max_booking_horizon_days: input.maxBookingHorizonDays }),
        ...(input.publicBookingPaused === undefined
          ? {}
          : { public_booking_paused: input.publicBookingPaused }),
        ...(input.cancellationCutoffMinutes === undefined
          ? {}
          : {
              cancellation_cutoff_minutes: input.cancellationCutoffMinutes,
            }),
        updated_at: new Date(),
      })
      .where("id", "=", input.organizationId)
      .returning([
        "slot_interval_minutes",
        "min_booking_notice_minutes",
        "max_booking_horizon_days",
        "public_booking_paused",
        "cancellation_cutoff_minutes",
      ])
      .executeTakeFirstOrThrow();
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
