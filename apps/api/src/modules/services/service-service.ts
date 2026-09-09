import { db } from "../../db.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../organizations/organization-write-policy.js";

type CreateServiceInput = {
  userId: string;
  organizationId: string;
  name: string;
  durationMinutes: number;
  priceAgorot: number | null;
  bufferAfterMinutes: number;
};

type CreateServiceFailure =
  | "organization_not_found"
  | "insufficient_role"
  | "price_required"
  | "pricing_disabled"
  | OrganizationWriteStateFailure;

export type CreateServiceResult =
  | {
      ok: true;
      service: {
        id: string;
        name: string;
        durationMinutes: number;
        priceAgorot: number | null;
        bufferAfterMinutes: number;
        displayOrder: number;
        deactivatedAt: null;
        createdAt: string;
      };
    }
  | {
      ok: false;
      reason: CreateServiceFailure;
    };

export async function createService(
  input: CreateServiceInput,
): Promise<CreateServiceResult> {
  return db.transaction().execute(async (trx) => {
    const membership = await trx
      .selectFrom("membership")
      .select("role")
      .where("organization_id", "=", input.organizationId)
      .where("user_id", "=", input.userId)
      .forUpdate()
      .executeTakeFirst();

    if (!membership) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    if (membership.role === "staff") {
      return {
        ok: false,
        reason: "insufficient_role",
      };
    }

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );

    if (!writeState.ok) {
      return writeState;
    }

    const organization = await trx
      .selectFrom("organization")
      .select("pricing_enabled")
      .where("id", "=", input.organizationId)
      .executeTakeFirstOrThrow();

    if (organization.pricing_enabled && input.priceAgorot === null) {
      return {
        ok: false,
        reason: "price_required",
      };
    }

    if (!organization.pricing_enabled && input.priceAgorot !== null) {
      return {
        ok: false,
        reason: "pricing_disabled",
      };
    }

    const currentOrder = await trx
      .selectFrom("service")
      .select((eb) => eb.fn.max("display_order").as("max_display_order"))
      .where("organization_id", "=", input.organizationId)
      .executeTakeFirst();

    const displayOrder = (currentOrder?.max_display_order ?? -1) + 1;

    const service = await trx
      .insertInto("service")
      .values({
        organization_id: input.organizationId,
        name: input.name.trim(),
        duration_minutes: input.durationMinutes,
        price_agorot: input.priceAgorot,
        buffer_after_minutes: input.bufferAfterMinutes,
        display_order: displayOrder,
        deactivated_at: null,
      })
      .returning([
        "id",
        "name",
        "duration_minutes",
        "price_agorot",
        "buffer_after_minutes",
        "display_order",
        "created_at",
      ])
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      service: {
        id: service.id,
        name: service.name,
        durationMinutes: service.duration_minutes,
        priceAgorot: service.price_agorot,
        bufferAfterMinutes: service.buffer_after_minutes,
        displayOrder: service.display_order,
        deactivatedAt: null,
        createdAt: service.created_at.toISOString(),
      },
    };
  });
}

type ManageServiceLifecycleInput = {
  userId: string;
  organizationId: string;
  serviceId: string;
};

type ManageServiceLifecycleFailure =
  | "organization_not_found"
  | "service_not_found"
  | "insufficient_role"
  | OrganizationWriteStateFailure;

export type ManageServiceLifecycleResult =
  | {
      ok: true;
      service: {
        id: string;
        deactivatedAt: string | null;
      };
    }
  | {
      ok: false;
      reason: ManageServiceLifecycleFailure;
    };

export async function deactivateService(
  input: ManageServiceLifecycleInput,
): Promise<ManageServiceLifecycleResult> {
  return db.transaction().execute(async (trx) => {
    const membership = await trx
      .selectFrom("membership")
      .select("role")
      .where("organization_id", "=", input.organizationId)
      .where("user_id", "=", input.userId)
      .forUpdate()
      .executeTakeFirst();

    if (!membership) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    if (membership.role === "staff") {
      return {
        ok: false,
        reason: "insufficient_role",
      };
    }

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );

    if (!writeState.ok) {
      return writeState;
    }

    const service = await trx
      .selectFrom("service")
      .select(["id", "deactivated_at"])
      .where("id", "=", input.serviceId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!service) {
      return {
        ok: false,
        reason: "service_not_found",
      };
    }

    if (service.deactivated_at) {
      return {
        ok: true,
        service: {
          id: service.id,
          deactivatedAt: service.deactivated_at.toISOString(),
        },
      };
    }

    const deactivatedAt = new Date();

    await trx
      .updateTable("service")
      .set({
        deactivated_at: deactivatedAt,
        updated_at: deactivatedAt,
      })
      .where("id", "=", service.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      service: {
        id: service.id,
        deactivatedAt: deactivatedAt.toISOString(),
      },
    };
  });
}

export async function reactivateService(
  input: ManageServiceLifecycleInput,
): Promise<ManageServiceLifecycleResult> {
  return db.transaction().execute(async (trx) => {
    const membership = await trx
      .selectFrom("membership")
      .select("role")
      .where("organization_id", "=", input.organizationId)
      .where("user_id", "=", input.userId)
      .forUpdate()
      .executeTakeFirst();

    if (!membership) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    if (membership.role === "staff") {
      return {
        ok: false,
        reason: "insufficient_role",
      };
    }

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );

    if (!writeState.ok) {
      return writeState;
    }

    const service = await trx
      .selectFrom("service")
      .select(["id", "deactivated_at"])
      .where("id", "=", input.serviceId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!service) {
      return {
        ok: false,
        reason: "service_not_found",
      };
    }

    if (!service.deactivated_at) {
      return {
        ok: true,
        service: {
          id: service.id,
          deactivatedAt: null,
        },
      };
    }

    const updatedAt = new Date();

    await trx
      .updateTable("service")
      .set({
        deactivated_at: null,
        updated_at: updatedAt,
      })
      .where("id", "=", service.id)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      service: {
        id: service.id,
        deactivatedAt: null,
      },
    };
  });
}
