import { db } from "../../../db.js";
import { publicBookingDateWindow } from "../../availability/domain/public-booking-window.js";

export type PublicBookingContext = {
  organization: {
    name: string;
    slug: string;
    timezone: "Asia/Jerusalem";
  };
  bookingWindow: { firstDate: string; lastDate: string };
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    priceAgorot: number | null;
    resources: Array<{ id: string; name: string }>;
  }>;
};

export type GetPublicBookingContextResult =
  | { ok: true; context: PublicBookingContext }
  | { ok: false; reason: "public_booking_context_not_found" };

type PublicCatalogRow = {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  priceAgorot: number | null;
  resourceId: string;
  resourceName: string;
};

export function projectPublicServices(
  rows: readonly PublicCatalogRow[],
): PublicBookingContext["services"] {
  const services = new Map<string, PublicBookingContext["services"][number]>();

  for (const row of rows) {
    const existing = services.get(row.serviceId);
    if (existing) {
      existing.resources.push({ id: row.resourceId, name: row.resourceName });
      continue;
    }

    services.set(row.serviceId, {
      id: row.serviceId,
      name: row.serviceName,
      durationMinutes: row.durationMinutes,
      priceAgorot: row.priceAgorot,
      resources: [{ id: row.resourceId, name: row.resourceName }],
    });
  }

  return [...services.values()];
}

export async function getPublicBookingContext(
  organizationSlug: string,
  now: Date = new Date(),
): Promise<GetPublicBookingContextResult> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const organization = await trx
        .selectFrom("organization")
        .select(["id", "name", "slug", "max_booking_horizon_days"])
        .where("slug", "=", organizationSlug)
        .where("published_at", "is not", null)
        .where("archived_at", "is", null)
        .where("suspended_at", "is", null)
        .where("public_booking_paused", "=", false)
        .executeTakeFirst();

      if (!organization)
        return { ok: false, reason: "public_booking_context_not_found" };

      const rows = await trx
        .selectFrom("service")
        .innerJoin("resource_service as assignment", (join) =>
          join
            .onRef("assignment.service_id", "=", "service.id")
            .onRef(
              "assignment.organization_id",
              "=",
              "service.organization_id",
            ),
        )
        .innerJoin("resource", (join) =>
          join
            .onRef("resource.id", "=", "assignment.resource_id")
            .onRef(
              "resource.organization_id",
              "=",
              "assignment.organization_id",
            ),
        )
        .select([
          "service.id as serviceId",
          "service.name as serviceName",
          "service.duration_minutes as durationMinutes",
          "service.price_agorot as priceAgorot",
          "resource.id as resourceId",
          "resource.name as resourceName",
        ])
        .where("service.organization_id", "=", organization.id)
        .where("assignment.organization_id", "=", organization.id)
        .where("resource.organization_id", "=", organization.id)
        .where("service.deactivated_at", "is", null)
        .where("resource.deactivated_at", "is", null)
        .orderBy("service.display_order", "asc")
        .orderBy("service.id", "asc")
        .orderBy("resource.name", "asc")
        .orderBy("resource.id", "asc")
        .execute();

      return {
        ok: true,
        context: {
          organization: {
            name: organization.name,
            slug: organization.slug,
            timezone: "Asia/Jerusalem",
          },
          bookingWindow: publicBookingDateWindow(
            now,
            organization.max_booking_horizon_days,
          ),
          services: projectPublicServices(rows),
        },
      };
    });
}
