import { sql } from "kysely";
import { db } from "../../../db.js";
import { insertOutboxEventInTransaction } from "../../../outbox/persistence.js";
import {
  type OrganizationManuallyProvisionedPayload,
  organizationLifecycleEventTypes,
} from "../domain/lifecycle-events.js";
import { provisionOrganizationInTransaction } from "./provisioning.js";

type ManualProvisionInput = {
  userId: string;
  organizationName: string;
  ownerEmail: string;
  customerMessage?: string | undefined;
  internalNote?: string | undefined;
};

const optionalTrimmed = (value: string | undefined) => value?.trim() || null;

export async function manuallyProvisionOrganization(
  input: ManualProvisionInput,
) {
  return db.transaction().execute(async (trx) => {
    const admin = await trx
      .selectFrom("platform_admin")
      .select("user_id")
      .where("user_id", "=", input.userId)
      .where("revoked_at", "is", null)
      .executeTakeFirst();
    if (!admin)
      return { ok: false as const, reason: "platform_admin_required" as const };

    const owner = await trx
      .selectFrom("user")
      .select(["id", "name", "email"])
      .where(
        sql<boolean>`lower(trim(email)) = lower(${input.ownerEmail.trim()})`,
      )
      .where("emailVerified", "=", true)
      .executeTakeFirst();
    if (!owner)
      return { ok: false as const, reason: "owner_not_found" as const };

    const organization = await provisionOrganizationInTransaction(trx, {
      name: input.organizationName,
      ownerUserId: owner.id,
    });
    if (!organization)
      return { ok: false as const, reason: "slug_unavailable" as const };

    const occurredAt = new Date();
    await trx
      .insertInto("organization_lifecycle_event")
      .values({
        organization_id: organization.id,
        action: "manually_provisioned",
        actor_user_id: input.userId,
        reason: null,
        internal_note: optionalTrimmed(input.internalNote),
        occurred_at: occurredAt,
      })
      .execute();

    await insertOutboxEventInTransaction<
      typeof organizationLifecycleEventTypes.manuallyProvisioned,
      OrganizationManuallyProvisionedPayload
    >(trx, {
      aggregateType: "organization",
      aggregateId: organization.id,
      eventType: organizationLifecycleEventTypes.manuallyProvisioned,
      payload: {
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        recipientName: owner.name,
        recipientEmail: owner.email,
        customerMessage: optionalTrimmed(input.customerMessage),
      },
      occurredAt,
    });

    return {
      ok: true as const,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        publishedAt: null,
        owner: { id: owner.id, name: owner.name, email: owner.email },
        createdAt: organization.created_at.toISOString(),
      },
    };
  });
}
