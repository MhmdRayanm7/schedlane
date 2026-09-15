import type { Selectable, Transaction } from "kysely";
import { DatabaseError } from "pg";
import { db } from "../../db.js";
import type { Database, ResourceTimeBlockTable } from "../../db-types.js";
import { lockOrganizationMemberships } from "../organizations/organization-membership-lock.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../organizations/organization-write-policy.js";
import { isLocalDate } from "./local-date.js";
import { isMinuteInterval } from "./minute-interval.js";
import { canManageResourceAvailability } from "./resource-availability-policy.js";

type ResourceInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
};
type TimeBlockFailure = {
  ok: false;
  reason:
    | "organization_not_found"
    | "resource_not_found"
    | "insufficient_role"
    | "invalid_time_block"
    | "time_block_not_found"
    | "time_block_overlap"
    | OrganizationWriteStateFailure;
};
type TimeBlockItem = {
  id: string;
  startMinute: number;
  endMinute: number;
  createdAt: string;
};
export type ListResourceTimeBlocksResult =
  | TimeBlockFailure
  | {
      ok: true;
      timeBlocks: {
        timezone: "Asia/Jerusalem";
        resourceId: string;
        date: string;
        items: TimeBlockItem[];
      };
    };
export type CreateResourceTimeBlockResult =
  | TimeBlockFailure
  | {
      ok: true;
      timeBlock: TimeBlockItem & { resourceId: string; date: string };
    };
export type DeleteResourceTimeBlockResult = TimeBlockFailure | { ok: true };

async function authorizeResource(
  trx: Transaction<Database>,
  input: ResourceInput,
  write: boolean,
): Promise<TimeBlockFailure | { ok: true }> {
  // Writes always lock ordered memberships -> Organization -> tenant-scoped Resource.
  const memberships = write
    ? await lockOrganizationMemberships(trx, input.organizationId)
    : await trx
        .selectFrom("membership")
        .select(["user_id", "role"])
        .where("organization_id", "=", input.organizationId)
        .execute();
  const actor = memberships.find((member) => member.user_id === input.userId);
  if (!actor) return { ok: false, reason: "organization_not_found" };
  if (write) {
    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );
    if (!writeState.ok) return writeState;
  }
  const query = trx
    .selectFrom("resource")
    .select("user_id")
    .where("id", "=", input.resourceId)
    .where("organization_id", "=", input.organizationId);
  const resource = await (write ? query.forUpdate() : query).executeTakeFirst();
  if (!resource) return { ok: false, reason: "resource_not_found" };
  if (!canManageResourceAvailability(actor, resource.user_id, memberships))
    return { ok: false, reason: "insufficient_role" };
  return { ok: true };
}

function timeBlockItem(row: Selectable<ResourceTimeBlockTable>): TimeBlockItem {
  return {
    id: row.id,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listResourceTimeBlocks(
  input: ResourceInput & { date: string },
): Promise<ListResourceTimeBlocksResult> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const access = await authorizeResource(trx, input, false);
      if (!access.ok) return access;
      if (!isLocalDate(input.date))
        return { ok: false, reason: "invalid_time_block" };
      const rows = await trx
        .selectFrom("resource_time_block")
        .selectAll()
        .where("organization_id", "=", input.organizationId)
        .where("resource_id", "=", input.resourceId)
        .where("local_date", "=", input.date)
        .orderBy("start_minute")
        .orderBy("id")
        .execute();
      return {
        ok: true,
        timeBlocks: {
          timezone: "Asia/Jerusalem",
          resourceId: input.resourceId,
          date: input.date,
          items: rows.map(timeBlockItem),
        },
      };
    });
}

export async function createResourceTimeBlock(
  input: ResourceInput & {
    date: string;
    startMinute: number;
    endMinute: number;
  },
): Promise<CreateResourceTimeBlockResult> {
  try {
    return await db.transaction().execute(async (trx) => {
      const access = await authorizeResource(trx, input, true);
      if (!access.ok) return access;
      if (
        !isLocalDate(input.date) ||
        !isMinuteInterval({
          startMinute: input.startMinute,
          endMinute: input.endMinute,
        })
      )
        return { ok: false, reason: "invalid_time_block" };
      const row = await trx
        .insertInto("resource_time_block")
        .values({
          organization_id: input.organizationId,
          resource_id: input.resourceId,
          local_date: input.date,
          start_minute: input.startMinute,
          end_minute: input.endMinute,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        ok: true,
        timeBlock: {
          ...timeBlockItem(row),
          resourceId: row.resource_id,
          date: row.local_date,
        },
      };
    });
  } catch (error) {
    // The exclusion constraint is authoritative, including for concurrent inserts.
    if (
      error instanceof DatabaseError &&
      error.table === "resource_time_block"
    ) {
      if (
        error.code === "23P01" &&
        error.constraint === "resource_time_block_no_overlap"
      )
        return { ok: false, reason: "time_block_overlap" };
      if (error.code === "23514")
        return { ok: false, reason: "invalid_time_block" };
    }
    throw error;
  }
}

export async function deleteResourceTimeBlock(
  input: ResourceInput & { timeBlockId: string },
): Promise<DeleteResourceTimeBlockResult> {
  return db.transaction().execute(async (trx) => {
    const access = await authorizeResource(trx, input, true);
    if (!access.ok) return access;
    const deleted = await trx
      .deleteFrom("resource_time_block")
      .where("organization_id", "=", input.organizationId)
      .where("resource_id", "=", input.resourceId)
      .where("id", "=", input.timeBlockId)
      .returning("id")
      .executeTakeFirst();
    if (!deleted) return { ok: false, reason: "time_block_not_found" };
    return { ok: true };
  });
}
