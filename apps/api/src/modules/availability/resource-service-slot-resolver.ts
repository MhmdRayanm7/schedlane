import type { Transaction } from "kysely";
import { db } from "../../db.js";
import type { Database } from "../../db-types.js";
import { authorizeResourceAvailabilityRead } from "./resource-availability-read-access.js";
import type { ResolveResourceWorkingWindowsResult } from "./resource-schedule-resolver.js";
import { resolveResourceWorkingWindowsAfterAccessInTransaction } from "./resource-schedule-resolver.js";
import { generateServiceSlotStarts } from "./service-slot-starts.js";

export type ResolveResourceServiceSlotStartsInput = {
  userId: string;
  organizationId: string;
  resourceId: string;
  serviceId: string;
  date: string;
};
export type ResolveResourceServiceSlotContextAfterAccessInput = Omit<
  ResolveResourceServiceSlotStartsInput,
  "userId"
>;
export type ResolveResourceServiceSnapshotSlotContextAfterAccessInput =
  ResolveResourceServiceSlotContextAfterAccessInput & {
    durationMinutes: number;
    bufferAfterMinutes: number;
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

export type ResolveResourceServiceSlotContextAfterAccessResult =
  | {
      ok: true;
      context: {
        timezone: "Asia/Jerusalem";
        resourceId: string;
        serviceId: string;
        date: string;
        starts: number[];
        slotIntervalMinutes: number;
        durationMinutes: number;
        bufferAfterMinutes: number;
        priceAgorot: number | null;
        pricingEnabled: boolean;
        serviceDeactivatedAt: Date | null;
      };
    }
  | {
      ok: false;
      reason: "invalid_date" | "service_not_found" | "service_not_assigned";
    };

export type ResolveResourceServiceSnapshotSlotContextAfterAccessResult =
  | {
      ok: true;
      context: {
        timezone: "Asia/Jerusalem";
        resourceId: string;
        serviceId: string;
        date: string;
        starts: number[];
        slotIntervalMinutes: number;
        durationMinutes: number;
        bufferAfterMinutes: number;
      };
    }
  | {
      ok: false;
      reason: "invalid_date" | "service_not_found" | "service_not_assigned";
    };

type ConfiguredResourceServiceSlotInputs = {
  workingWindows: Extract<
    ResolveResourceWorkingWindowsResult,
    { ok: true }
  >["workingWindows"];
  slotIntervalMinutes: number;
  pricingEnabled: boolean;
  service: {
    id: string;
    durationMinutes: number;
    bufferAfterMinutes: number;
    priceAgorot: number | null;
    deactivatedAt: Date | null;
  };
};

type LoadConfiguredResourceServiceSlotInputsResult =
  | { ok: true; inputs: ConfiguredResourceServiceSlotInputs }
  | Extract<
      ResolveResourceServiceSnapshotSlotContextAfterAccessResult,
      { ok: false }
    >;

async function loadConfiguredResourceServiceSlotInputs(
  trx: Transaction<Database>,
  input: ResolveResourceServiceSlotContextAfterAccessInput,
): Promise<LoadConfiguredResourceServiceSlotInputsResult> {
  const workingWindows =
    await resolveResourceWorkingWindowsAfterAccessInTransaction(trx, input);
  if (!workingWindows.ok) {
    if (workingWindows.reason === "invalid_date")
      return { ok: false, reason: workingWindows.reason };
    throw new Error(
      "Preauthorized Resource working-window resolution required authorization",
    );
  }

  const organization = await trx
    .selectFrom("organization")
    .select(["slot_interval_minutes", "pricing_enabled"])
    .where("id", "=", input.organizationId)
    .executeTakeFirst();
  if (!organization)
    throw new Error(
      "Organization disappeared after Resource access authorization",
    );

  const service = await trx
    .selectFrom("service")
    .select([
      "id",
      "duration_minutes",
      "buffer_after_minutes",
      "price_agorot",
      "deactivated_at",
    ])
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

  return {
    ok: true,
    inputs: {
      workingWindows: workingWindows.workingWindows,
      slotIntervalMinutes: organization.slot_interval_minutes,
      pricingEnabled: organization.pricing_enabled,
      service: {
        id: service.id,
        durationMinutes: service.duration_minutes,
        bufferAfterMinutes: service.buffer_after_minutes,
        priceAgorot: service.price_agorot,
        deactivatedAt: service.deactivated_at,
      },
    },
  };
}

// The caller owns authorization and the transaction snapshot.
export async function resolveResourceServiceSlotContextAfterAccessInTransaction(
  trx: Transaction<Database>,
  input: ResolveResourceServiceSlotContextAfterAccessInput,
): Promise<ResolveResourceServiceSlotContextAfterAccessResult> {
  const configured = await loadConfiguredResourceServiceSlotInputs(trx, input);
  if (!configured.ok) return configured;
  const { service, workingWindows, slotIntervalMinutes, pricingEnabled } =
    configured.inputs;

  const starts = generateServiceSlotStarts(
    workingWindows.intervals,
    slotIntervalMinutes,
    service.durationMinutes,
    service.bufferAfterMinutes,
  );
  if (starts === null)
    throw new Error("Persisted slot configuration violated domain invariants");

  return {
    ok: true,
    context: {
      timezone: workingWindows.timezone,
      resourceId: input.resourceId,
      serviceId: service.id,
      date: input.date,
      starts,
      slotIntervalMinutes,
      durationMinutes: service.durationMinutes,
      bufferAfterMinutes: service.bufferAfterMinutes,
      priceAgorot: service.priceAgorot,
      pricingEnabled,
      serviceDeactivatedAt: service.deactivatedAt,
    },
  };
}

// Configured slots for an existing Booking: the caller owns authorization,
// transaction/locks and occupancy policy, while persisted Booking timing wins.
export async function resolveResourceServiceSnapshotSlotContextAfterAccessInTransaction(
  trx: Transaction<Database>,
  input: ResolveResourceServiceSnapshotSlotContextAfterAccessInput,
): Promise<ResolveResourceServiceSnapshotSlotContextAfterAccessResult> {
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes <= 0 ||
    !Number.isInteger(input.bufferAfterMinutes) ||
    input.bufferAfterMinutes < 0
  )
    throw new Error("Persisted Booking timing snapshots violated invariants");

  const configured = await loadConfiguredResourceServiceSlotInputs(trx, input);
  if (!configured.ok) return configured;
  const { workingWindows, slotIntervalMinutes, service } = configured.inputs;
  const starts = generateServiceSlotStarts(
    workingWindows.intervals,
    slotIntervalMinutes,
    input.durationMinutes,
    input.bufferAfterMinutes,
  );
  if (starts === null)
    throw new Error("Persisted slot configuration violated domain invariants");

  return {
    ok: true,
    context: {
      timezone: workingWindows.timezone,
      resourceId: input.resourceId,
      serviceId: service.id,
      date: input.date,
      starts,
      slotIntervalMinutes,
      durationMinutes: input.durationMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
    },
  };
}

// These configured slots intentionally exclude Bookings and public eligibility policy.
export async function resolveResourceServiceSlotStartsForDate(
  input: ResolveResourceServiceSlotStartsInput,
): Promise<ResolveResourceServiceSlotStartsResult> {
  // This transaction owns every read so the calculation represents one coherent snapshot.
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const access = await authorizeResourceAvailabilityRead(trx, input);
      if (!access.ok) return access;
      const result =
        await resolveResourceServiceSlotContextAfterAccessInTransaction(
          trx,
          input,
        );
      if (!result.ok) return result;

      return {
        ok: true,
        slots: {
          timezone: result.context.timezone,
          resourceId: result.context.resourceId,
          serviceId: result.context.serviceId,
          date: result.context.date,
          starts: result.context.starts,
        },
      };
    });
}
