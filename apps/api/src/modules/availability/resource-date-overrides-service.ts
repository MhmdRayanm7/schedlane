import { DatabaseError } from "pg";
import { db } from "../../db.js";
import { lockOrganizationMemberships } from "../organizations/organization-membership-lock.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../organizations/organization-write-policy.js";
import { toMinuteInterval } from "./availability-projections.js";
import { isLocalDate } from "./local-date.js";
import {
  type DateOverrideConfiguration,
  normalizeDateOverride,
  type OrganizationDateOverride,
} from "./organization-date-overrides.js";
import { canManageResourceAvailability } from "./resource-availability-policy.js";
import { authorizeResourceAvailabilityRead } from "./resource-availability-read-access.js";

type ResourceDateOverride = OrganizationDateOverride & { resourceId: string };

type DateOverrideInput = {
  resourceId: string;
  userId: string;
  organizationId: string;
  date: string;
};
export type ResourceDateOverrideResult =
  | { ok: true; override: ResourceDateOverride }
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | "resource_not_found"
        | "insufficient_role"
        | "invalid_date_override"
        | OrganizationWriteStateFailure;
    };

export async function getResourceDateOverride(
  input: DateOverrideInput,
): Promise<ResourceDateOverrideResult> {
  // Read authorization and both configuration tables from one consistent snapshot.
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const access = await authorizeResourceAvailabilityRead(trx, input);
      if (!access.ok) return access;
      if (!isLocalDate(input.date))
        return { ok: false, reason: "invalid_date_override" };
      const parent = await trx
        .selectFrom("resource_date_override")
        .select("local_date")
        .where("organization_id", "=", input.organizationId)
        .where("resource_id", "=", input.resourceId)
        .where("local_date", "=", input.date)
        .executeTakeFirst();
      if (!parent)
        return {
          ok: true,
          override: {
            timezone: "Asia/Jerusalem",
            resourceId: input.resourceId,
            date: input.date,
            mode: "inherit",
            intervals: [],
          },
        };
      const rows = await trx
        .selectFrom("resource_date_override_interval")
        .select(["start_minute", "end_minute"])
        .where("organization_id", "=", input.organizationId)
        .where("resource_id", "=", input.resourceId)
        .where("local_date", "=", input.date)
        .orderBy("start_minute")
        .execute();
      return {
        ok: true,
        override: {
          timezone: "Asia/Jerusalem",
          resourceId: input.resourceId,
          date: parent.local_date,
          mode: rows.length ? "custom" : "closed",
          intervals: rows.map(toMinuteInterval),
        },
      };
    });
}

export async function replaceResourceDateOverride(
  input: DateOverrideInput & DateOverrideConfiguration,
): Promise<ResourceDateOverrideResult> {
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
      const override = normalizeDateOverride(input.date, input);
      if (!override) return { ok: false, reason: "invalid_date_override" };

      await trx
        .deleteFrom("resource_date_override")
        .where("organization_id", "=", input.organizationId)
        .where("resource_id", "=", input.resourceId)
        .where("local_date", "=", input.date)
        .execute();
      if (override.mode !== "inherit") {
        await trx
          .insertInto("resource_date_override")
          .values({
            organization_id: input.organizationId,
            resource_id: input.resourceId,
            local_date: input.date,
          })
          .execute();
      }
      if (override.intervals.length) {
        await trx
          .insertInto("resource_date_override_interval")
          .values(
            override.intervals.map((interval) => ({
              organization_id: input.organizationId,
              resource_id: input.resourceId,
              local_date: input.date,
              start_minute: interval.startMinute,
              end_minute: interval.endMinute,
            })),
          )
          .execute();
      }
      return {
        ok: true,
        override: { ...override, resourceId: input.resourceId },
      };
    });
  } catch (error) {
    // Translate only after rollback has restored the previous parent and intervals.
    if (
      error instanceof DatabaseError &&
      (error.table === "resource_date_override" ||
        error.table === "resource_date_override_interval") &&
      (error.code === "23P01" ||
        error.code === "23514" ||
        error.code === "23505")
    )
      return { ok: false, reason: "invalid_date_override" };
    throw error;
  }
}
