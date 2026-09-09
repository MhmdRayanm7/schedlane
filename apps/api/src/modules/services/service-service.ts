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
