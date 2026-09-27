import type { Kysely } from "kysely";
import { db } from "../../../db.js";
import type { Database } from "../../../db-types.js";

export type PublicationServiceBlocker = {
  serviceId: string;
  serviceName: string;
};

export type PublicationReadinessCheck = {
  code:
    | "organization_active"
    | "platform_active"
    | "active_service"
    | "active_resource"
    | "service_resources"
    | "working_hours"
    | "service_prices";
  ready: boolean;
  count?: number;
  services?: PublicationServiceBlocker[];
  applicable?: boolean;
};

export type PublicationReadiness = {
  ready: boolean;
  checks: PublicationReadinessCheck[];
};

type ReadinessFacts = {
  archived: boolean;
  suspended: boolean;
  pricingEnabled: boolean;
  activeServices: PublicationServiceBlocker[];
  activeResources: Array<{ resourceId: string }>;
  assignments: Array<{ serviceId: string; resourceId: string }>;
  hasWorkingHours: boolean;
  missingPriceServices: PublicationServiceBlocker[];
};

export function calculatePublicationReadinessFromFacts(
  facts: ReadinessFacts,
): PublicationReadiness {
  const assignedServiceIds = new Set(
    facts.assignments.map((assignment) => assignment.serviceId),
  );
  const unassignedServices = facts.activeServices.filter(
    (service) => !assignedServiceIds.has(service.serviceId),
  );
  const checks: PublicationReadinessCheck[] = [
    { code: "organization_active", ready: !facts.archived },
    { code: "platform_active", ready: !facts.suspended },
    {
      code: "active_service",
      ready: facts.activeServices.length > 0,
      count: facts.activeServices.length,
    },
    {
      code: "active_resource",
      ready: facts.activeResources.length > 0,
      count: facts.activeResources.length,
    },
    {
      code: "service_resources",
      ready: unassignedServices.length === 0,
      services: unassignedServices,
    },
    { code: "working_hours", ready: facts.hasWorkingHours },
    {
      code: "service_prices",
      ready: !facts.pricingEnabled || facts.missingPriceServices.length === 0,
      applicable: facts.pricingEnabled,
      services: facts.pricingEnabled ? facts.missingPriceServices : [],
    },
  ];

  return { ready: checks.every((check) => check.ready), checks };
}

export async function calculatePublicationReadiness(
  executor: Kysely<Database>,
  organizationId: string,
): Promise<PublicationReadiness | null> {
  const organization = await executor
    .selectFrom("organization")
    .select(["archived_at", "suspended_at", "pricing_enabled"])
    .where("id", "=", organizationId)
    .executeTakeFirst();
  if (!organization) return null;

  const [services, resources, assignments, workingHours] = await Promise.all([
    executor
      .selectFrom("service")
      .select(["id", "name", "price_agorot"])
      .where("organization_id", "=", organizationId)
      .where("deactivated_at", "is", null)
      .orderBy("display_order", "asc")
      .orderBy("id", "asc")
      .execute(),
    executor
      .selectFrom("resource")
      .select("id")
      .where("organization_id", "=", organizationId)
      .where("deactivated_at", "is", null)
      .execute(),
    executor
      .selectFrom("resource_service as assignment")
      .innerJoin("service", (join) =>
        join
          .onRef("service.id", "=", "assignment.service_id")
          .onRef("service.organization_id", "=", "assignment.organization_id"),
      )
      .innerJoin("resource", (join) =>
        join
          .onRef("resource.id", "=", "assignment.resource_id")
          .onRef("resource.organization_id", "=", "assignment.organization_id"),
      )
      .select([
        "assignment.service_id as serviceId",
        "assignment.resource_id as resourceId",
      ])
      .where("assignment.organization_id", "=", organizationId)
      .where("service.deactivated_at", "is", null)
      .where("resource.deactivated_at", "is", null)
      .execute(),
    executor
      .selectFrom("organization_weekly_hours")
      .select("organization_id")
      .where("organization_id", "=", organizationId)
      .limit(1)
      .executeTakeFirst(),
  ]);

  const activeServices = services.map((service) => ({
    serviceId: service.id,
    serviceName: service.name,
  }));

  return calculatePublicationReadinessFromFacts({
    archived: organization.archived_at !== null,
    suspended: organization.suspended_at !== null,
    pricingEnabled: organization.pricing_enabled,
    activeServices,
    activeResources: resources.map((resource) => ({ resourceId: resource.id })),
    assignments,
    hasWorkingHours: Boolean(workingHours),
    missingPriceServices: services
      .filter((service) => service.price_agorot === null)
      .map((service) => ({
        serviceId: service.id,
        serviceName: service.name,
      })),
  });
}

export async function getOrganizationPublicationReadiness(input: {
  userId: string;
  organizationId: string;
}) {
  const membership = await db
    .selectFrom("membership")
    .select("role")
    .where("user_id", "=", input.userId)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirst();
  if (!membership)
    return { ok: false as const, reason: "organization_not_found" as const };
  if (membership.role === "staff")
    return { ok: false as const, reason: "insufficient_role" as const };
  const readiness = await calculatePublicationReadiness(
    db,
    input.organizationId,
  );
  if (!readiness)
    return { ok: false as const, reason: "organization_not_found" as const };
  return { ok: true as const, readiness };
}
