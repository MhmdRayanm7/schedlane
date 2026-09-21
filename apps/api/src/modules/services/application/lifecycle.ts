import { db } from "../../../db.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "../../organizations/application/write-policy.js";

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
