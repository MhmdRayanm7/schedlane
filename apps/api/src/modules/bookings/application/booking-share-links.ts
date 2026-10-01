import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import { db } from "../../../db.js";
import { requireWritableOrganization } from "../../organizations/application/write-policy.js";

export type BookingShareScope = {
  serviceId: string | null;
  resourceId: string | null;
};

export type BookingShareLink = BookingShareScope & {
  id: string;
  token: string;
  serviceName: string | null;
  resourceName: string | null;
  createdAt: string;
  revokedAt: string | null;
};

type AccessFailure = "organization_not_found" | "insufficient_role";
type WriteFailure =
  | AccessFailure
  | "organization_archived"
  | "organization_suspended";

export function generateBookingShareToken(): string {
  return randomBytes(32).toString("base64url");
}

async function requireOwner(
  userId: string,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; reason: AccessFailure }> {
  const membership = await db
    .selectFrom("membership")
    .select("role")
    .where("organization_id", "=", organizationId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!membership) return { ok: false, reason: "organization_not_found" };
  if (membership.role !== "owner")
    return { ok: false, reason: "insufficient_role" };
  return { ok: true };
}

function projectLink(row: {
  id: string;
  token: string;
  service_id: string | null;
  resource_id: string | null;
  service_name: string | null;
  resource_name: string | null;
  created_at: Date;
  revoked_at: Date | null;
}): BookingShareLink {
  return {
    id: row.id,
    token: row.token,
    serviceId: row.service_id,
    resourceId: row.resource_id,
    serviceName: row.service_name,
    resourceName: row.resource_name,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

const linkSelection = [
  "booking_share_link.id",
  "booking_share_link.token",
  "booking_share_link.service_id",
  "booking_share_link.resource_id",
  "service.name as service_name",
  "resource.name as resource_name",
  "booking_share_link.created_at",
  "booking_share_link.revoked_at",
] as const;

export async function listBookingShareLinks(input: {
  userId: string;
  organizationId: string;
}): Promise<
  { ok: true; items: BookingShareLink[] } | { ok: false; reason: AccessFailure }
> {
  const access = await requireOwner(input.userId, input.organizationId);
  if (!access.ok) return access;
  const rows = await db
    .selectFrom("booking_share_link")
    .leftJoin("service", "service.id", "booking_share_link.service_id")
    .leftJoin("resource", "resource.id", "booking_share_link.resource_id")
    .select(linkSelection)
    .where("booking_share_link.organization_id", "=", input.organizationId)
    .orderBy(sql<boolean>`booking_share_link.revoked_at IS NOT NULL`, "asc")
    .orderBy("booking_share_link.created_at", "desc")
    .execute();
  return { ok: true, items: rows.map(projectLink) };
}

export type CreateBookingShareLinkFailure =
  | WriteFailure
  | "booking_share_scope_invalid"
  | "service_not_found"
  | "service_inactive"
  | "resource_not_found"
  | "resource_inactive"
  | "service_not_assigned";

export async function createBookingShareLink(
  input: {
    userId: string;
    organizationId: string;
    serviceId?: string;
    resourceId?: string;
  },
  dependencies: { generateToken?: () => string } = {},
): Promise<
  | { ok: true; link: BookingShareLink }
  | { ok: false; reason: CreateBookingShareLinkFailure }
> {
  const access = await requireOwner(input.userId, input.organizationId);
  if (!access.ok) return access;
  if (!input.serviceId && !input.resourceId)
    return { ok: false, reason: "booking_share_scope_invalid" };

  return db.transaction().execute(async (trx) => {
    const writable = await requireWritableOrganization(
      trx,
      input.organizationId,
    );
    if (!writable.ok) return writable;

    if (input.serviceId) {
      const service = await trx
        .selectFrom("service")
        .select("deactivated_at")
        .where("id", "=", input.serviceId)
        .where("organization_id", "=", input.organizationId)
        .executeTakeFirst();
      if (!service)
        return { ok: false as const, reason: "service_not_found" as const };
      if (service.deactivated_at)
        return { ok: false as const, reason: "service_inactive" as const };
    }
    if (input.resourceId) {
      const resource = await trx
        .selectFrom("resource")
        .select("deactivated_at")
        .where("id", "=", input.resourceId)
        .where("organization_id", "=", input.organizationId)
        .executeTakeFirst();
      if (!resource)
        return { ok: false as const, reason: "resource_not_found" as const };
      if (resource.deactivated_at)
        return { ok: false as const, reason: "resource_inactive" as const };
    }

    const assignment = await trx
      .selectFrom("resource_service as assignment")
      .innerJoin("service", "service.id", "assignment.service_id")
      .innerJoin("resource", "resource.id", "assignment.resource_id")
      .select("assignment.service_id")
      .where("assignment.organization_id", "=", input.organizationId)
      .$if(Boolean(input.serviceId), (query) =>
        query.where("assignment.service_id", "=", input.serviceId ?? ""),
      )
      .$if(Boolean(input.resourceId), (query) =>
        query.where("assignment.resource_id", "=", input.resourceId ?? ""),
      )
      .where("service.deactivated_at", "is", null)
      .where("resource.deactivated_at", "is", null)
      .executeTakeFirst();
    if (!assignment)
      return { ok: false as const, reason: "service_not_assigned" as const };

    const row = await trx
      .insertInto("booking_share_link")
      .values({
        organization_id: input.organizationId,
        token: (dependencies.generateToken ?? generateBookingShareToken)(),
        service_id: input.serviceId ?? null,
        resource_id: input.resourceId ?? null,
        created_by_user_id: input.userId,
      })
      .returning([
        "id",
        "token",
        "service_id",
        "resource_id",
        "created_at",
        "revoked_at",
      ])
      .executeTakeFirstOrThrow();
    const [service, resource] = await Promise.all([
      row.service_id
        ? trx
            .selectFrom("service")
            .select("name")
            .where("id", "=", row.service_id)
            .executeTakeFirstOrThrow()
        : null,
      row.resource_id
        ? trx
            .selectFrom("resource")
            .select("name")
            .where("id", "=", row.resource_id)
            .executeTakeFirstOrThrow()
        : null,
    ]);
    return {
      ok: true as const,
      link: projectLink({
        ...row,
        service_name: service?.name ?? null,
        resource_name: resource?.name ?? null,
      }),
    };
  });
}

export async function revokeBookingShareLink(
  input: { userId: string; organizationId: string; linkId: string },
  now = new Date(),
): Promise<
  | { ok: true; link: BookingShareLink }
  | {
      ok: false;
      reason:
        | WriteFailure
        | "booking_share_link_not_found"
        | "booking_share_link_revoked";
    }
> {
  const access = await requireOwner(input.userId, input.organizationId);
  if (!access.ok) return access;
  return db.transaction().execute(async (trx) => {
    const writable = await requireWritableOrganization(
      trx,
      input.organizationId,
    );
    if (!writable.ok) return writable;
    const current = await trx
      .selectFrom("booking_share_link")
      .select("revoked_at")
      .where("id", "=", input.linkId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!current)
      return {
        ok: false as const,
        reason: "booking_share_link_not_found" as const,
      };
    if (current.revoked_at)
      return {
        ok: false as const,
        reason: "booking_share_link_revoked" as const,
      };
    const row = await trx
      .updateTable("booking_share_link")
      .set({ revoked_at: now, revoked_by_user_id: input.userId })
      .where("id", "=", input.linkId)
      .returning([
        "id",
        "token",
        "service_id",
        "resource_id",
        "created_at",
        "revoked_at",
      ])
      .executeTakeFirstOrThrow();
    const [service, resource] = await Promise.all([
      row.service_id
        ? trx
            .selectFrom("service")
            .select("name")
            .where("id", "=", row.service_id)
            .executeTakeFirstOrThrow()
        : null,
      row.resource_id
        ? trx
            .selectFrom("resource")
            .select("name")
            .where("id", "=", row.resource_id)
            .executeTakeFirstOrThrow()
        : null,
    ]);
    return {
      ok: true as const,
      link: projectLink({
        ...row,
        service_name: service?.name ?? null,
        resource_name: resource?.name ?? null,
      }),
    };
  });
}
