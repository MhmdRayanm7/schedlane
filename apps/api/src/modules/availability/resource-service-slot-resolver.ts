import { db } from "../../db.js";
import type { ResolveResourceWorkingWindowsResult } from "./resource-schedule-resolver.js";
import { resolveResourceWorkingWindowsInTransaction } from "./resource-schedule-resolver.js";
import { generateServiceSlotStarts } from "./service-slot-starts.js";

export type ResolveResourceServiceSlotStartsInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
  serviceId: string;
  date: string;
};

type ResourceWorkingWindowsFailure = Extract<
  ResolveResourceWorkingWindowsResult,
  { ok: false }
>["reason"];

export type ResolveResourceServiceSlotStartsResult =
  | {
      ok: true;
      slots: {
        timezone: "Asia/Jerusalem";
        resourceId: string;
        serviceId: string;
        date: string;
        starts: number[];
      };
    }
  | {
      ok: false;
      reason:
        | ResourceWorkingWindowsFailure
        | "service_not_found"
        | "service_not_assigned";
    };

// These configured slots intentionally exclude Bookings and public eligibility policy.
export async function resolveResourceServiceSlotStartsForDate(
  input: ResolveResourceServiceSlotStartsInput,
): Promise<ResolveResourceServiceSlotStartsResult> {
  // This transaction owns every read so the calculation represents one coherent snapshot.
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const workingWindows = await resolveResourceWorkingWindowsInTransaction(
        trx,
        input,
      );
      if (!workingWindows.ok) return workingWindows;

      const organization = await trx
        .selectFrom("organization")
        .select("slot_interval_minutes")
        .where("id", "=", input.organizationId)
        .executeTakeFirst();
      if (!organization)
        throw new Error(
          "Organization disappeared after Resource Availability authorization",
        );

      const service = await trx
        .selectFrom("service")
        .select(["id", "duration_minutes", "buffer_after_minutes"])
        .where("id", "=", input.serviceId)
        .where("organization_id", "=", input.organizationId)
        .executeTakeFirst();
      if (!service) return { ok: false, reason: "service_not_found" };

      const assignment = await trx
        .selectFrom("resource_service")
        .select("resource_id")
        .where("organization_id", "=", input.organizationId)
        .where("resource_id", "=", input.resourceId)
        .where("service_id", "=", service.id)
        .executeTakeFirst();
      if (!assignment) return { ok: false, reason: "service_not_assigned" };

      const starts = generateServiceSlotStarts(
        workingWindows.workingWindows.intervals,
        organization.slot_interval_minutes,
        service.duration_minutes,
        service.buffer_after_minutes,
      );
      if (starts === null)
        throw new Error(
          "Persisted slot configuration violated domain invariants",
        );

      return {
        ok: true,
        slots: {
          timezone: workingWindows.workingWindows.timezone,
          resourceId: input.resourceId,
          serviceId: service.id,
          date: input.date,
          starts,
        },
      };
    });
}
