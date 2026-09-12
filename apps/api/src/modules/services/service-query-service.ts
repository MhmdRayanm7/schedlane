import { db } from "../../db.js";

type ListServiceResourcesInput = {
  userId: string;
  organizationId: string;
  serviceId: string;
};

export type ListServiceResourcesResult =
  | {
      ok: true;
      items: Array<{ id: string; name: string; deactivatedAt: string | null }>;
    }
  | {
      ok: false;
      reason:
        | "organization_not_found"
        | "insufficient_role"
        | "service_not_found";
    };

export async function listServiceResources(
  input: ListServiceResourcesInput,
): Promise<ListServiceResourcesResult> {
  const membership = await db
    .selectFrom("membership")
    .select("role")
    .where("organization_id", "=", input.organizationId)
    .where("user_id", "=", input.userId)
    .executeTakeFirst();
  if (!membership) return { ok: false, reason: "organization_not_found" };
  if (membership.role === "staff")
    return { ok: false, reason: "insufficient_role" };

  const service = await db
    .selectFrom("service")
    .select("id")
    .where("id", "=", input.serviceId)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirst();
  if (!service) return { ok: false, reason: "service_not_found" };

  // Management retains visibility of assignments to deactivated Resources.
  const resources = await db
    .selectFrom("resource_service as assignment")
    .innerJoin("resource", (join) =>
      join
        .onRef("resource.id", "=", "assignment.resource_id")
        .onRef("resource.organization_id", "=", "assignment.organization_id"),
    )
    .select(["resource.id", "resource.name", "resource.deactivated_at"])
    .where("assignment.organization_id", "=", input.organizationId)
    .where("assignment.service_id", "=", service.id)
    .orderBy("resource.name", "asc")
    .orderBy("resource.id", "asc")
    .execute();

  return {
    ok: true,
    items: resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      deactivatedAt: resource.deactivated_at?.toISOString() ?? null,
    })),
  };
}

type ListOrganizationServicesInput = {
  userId: string;
  organizationId: string;
};

type ListOrganizationServicesFailure =
  | "organization_not_found"
  | "insufficient_role";

export type ListOrganizationServicesResult =
  | {
      ok: true;
      items: Array<{
        id: string;
        name: string;
        durationMinutes: number;
        priceAgorot: number | null;
        bufferAfterMinutes: number;
        displayOrder: number;
        deactivatedAt: string | null;
        createdAt: string;
      }>;
    }
  | {
      ok: false;
      reason: ListOrganizationServicesFailure;
    };

export async function listOrganizationServices(
  input: ListOrganizationServicesInput,
): Promise<ListOrganizationServicesResult> {
  const membership = await db
    .selectFrom("membership")
    .select("role")
    .where("organization_id", "=", input.organizationId)
    .where("user_id", "=", input.userId)
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

  const services = await db
    .selectFrom("service")
    .select([
      "id",
      "name",
      "duration_minutes",
      "price_agorot",
      "buffer_after_minutes",
      "display_order",
      "deactivated_at",
      "created_at",
    ])
    .where("organization_id", "=", input.organizationId)
    .orderBy("display_order", "asc")
    .orderBy("id", "asc")
    .execute();

  return {
    ok: true,
    items: services.map((service) => ({
      id: service.id,
      name: service.name,
      durationMinutes: service.duration_minutes,
      priceAgorot: service.price_agorot,
      bufferAfterMinutes: service.buffer_after_minutes,
      displayOrder: service.display_order,
      deactivatedAt: service.deactivated_at?.toISOString() ?? null,
      createdAt: service.created_at.toISOString(),
    })),
  };
}
