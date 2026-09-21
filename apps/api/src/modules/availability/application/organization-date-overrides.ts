import { DatabaseError } from "pg";
import { db } from "../../../db.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";
import { isLocalDate } from "../domain/local-date.js";
import {
  type DateOverrideConfiguration,
  normalizeDateOverride,
  type OrganizationDateOverride,
} from "../domain/organization-date-overrides.js";
import { toMinuteInterval } from "../domain/projections.js";

type DateOverrideInput = {
  userId: string;
  organizationId: string;
  date: string;
};
export type OrganizationDateOverrideResult =
  | { ok: true; override: OrganizationDateOverride }
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | "insufficient_role"
        | "invalid_date_override"
        | OrganizationWriteStateFailure;
    };

export async function getOrganizationDateOverride(
  input: DateOverrideInput,
): Promise<OrganizationDateOverrideResult> {
  // Read authorization and both configuration tables from one consistent snapshot.
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
      if (!isLocalDate(input.date))
        return { ok: false, reason: "invalid_date_override" };
      const parent = await trx
        .selectFrom("organization_date_override")
        .select("local_date")
        .where("organization_id", "=", input.organizationId)
        .where("local_date", "=", input.date)
        .executeTakeFirst();
      if (!parent)
        return {
          ok: true,
          override: {
            timezone: "Asia/Jerusalem",
            date: input.date,
            mode: "inherit",
            intervals: [],
          },
        };
      const rows = await trx
        .selectFrom("organization_date_override_interval")
        .select(["start_minute", "end_minute"])
        .where("organization_id", "=", input.organizationId)
        .where("local_date", "=", input.date)
        .orderBy("start_minute")
        .execute();
      return {
        ok: true,
        override: {
          timezone: "Asia/Jerusalem",
          date: parent.local_date,
          mode: rows.length ? "custom" : "closed",
          intervals: rows.map(toMinuteInterval),
        },
      };
    });
}

export async function replaceOrganizationDateOverride(
  input: DateOverrideInput & DateOverrideConfiguration,
): Promise<OrganizationDateOverrideResult> {
  try {
    return await db.transaction().execute(async (trx) => {
      // Actor Membership -> Organization; its write-state lock serializes replacements.
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
      const override = normalizeDateOverride(input.date, input);
      if (!override) return { ok: false, reason: "invalid_date_override" };

      await trx
        .deleteFrom("organization_date_override")
        .where("organization_id", "=", input.organizationId)
        .where("local_date", "=", input.date)
        .execute();
      if (override.mode !== "inherit") {
        await trx
          .insertInto("organization_date_override")
          .values({
            organization_id: input.organizationId,
            local_date: input.date,
          })
          .execute();
      }
      if (override.intervals.length) {
        await trx
          .insertInto("organization_date_override_interval")
          .values(
            override.intervals.map((interval) => ({
              organization_id: input.organizationId,
              local_date: input.date,
              start_minute: interval.startMinute,
              end_minute: interval.endMinute,
            })),
          )
          .execute();
      }
      return { ok: true, override };
    });
  } catch (error) {
    // Translate only after rollback has restored the previous parent and intervals.
    if (
      error instanceof DatabaseError &&
      (error.table === "organization_date_override" ||
        error.table === "organization_date_override_interval") &&
      (error.code === "23P01" ||
        error.code === "23514" ||
        error.code === "23505")
    )
      return { ok: false, reason: "invalid_date_override" };
    throw error;
  }
}
