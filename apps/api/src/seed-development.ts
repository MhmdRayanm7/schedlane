import type { Transaction } from "kysely";
import { db } from "./db.js";
import type { Database } from "./db-types.js";

const organization = {
  id: "00000000-0000-7000-8000-000000000001",
  name: "Schedlane Demo Barbers",
  slug: "demo-barbers",
} as const;

const services = [
  {
    id: "00000000-0000-7000-8000-000000000101",
    name: "Haircut",
    duration_minutes: 30,
    price_agorot: 7000,
    buffer_after_minutes: 0,
    display_order: 0,
  },
  {
    id: "00000000-0000-7000-8000-000000000102",
    name: "Beard Trim",
    duration_minutes: 20,
    price_agorot: 4000,
    buffer_after_minutes: 0,
    display_order: 1,
  },
] as const;

const resources = [
  {
    id: "00000000-0000-7000-8000-000000000201",
    name: "Mohammad",
  },
  {
    id: "00000000-0000-7000-8000-000000000202",
    name: "Ahmad",
  },
] as const;

const assignments = [
  { resource_id: resources[0].id, service_id: services[0].id },
  { resource_id: resources[1].id, service_id: services[0].id },
  { resource_id: resources[0].id, service_id: services[1].id },
] as const;

const weeklyHours = [7, 1, 2, 3, 4].map((weekday) => ({
  organization_id: organization.id,
  weekday,
  start_minute: 540,
  end_minute: 1020,
}));

const publishedAt = new Date("2026-01-01T00:00:00.000Z");

async function assertSeedOwnership(trx: Transaction<Database>) {
  const organizations = await trx
    .selectFrom("organization")
    .select(["id", "slug"])
    .where((expression) =>
      expression.or([
        expression("id", "=", organization.id),
        expression("slug", "=", organization.slug),
      ]),
    )
    .execute();

  if (
    organizations.some(
      (existing) =>
        existing.id !== organization.id || existing.slug !== organization.slug,
    )
  ) {
    throw new Error(
      `Cannot seed ${organization.slug}: its fixed ID or slug belongs to a different Organization`,
    );
  }

  const existingServices = await trx
    .selectFrom("service")
    .select(["id", "organization_id"])
    .where(
      "id",
      "in",
      services.map((service) => service.id),
    )
    .execute();

  if (
    existingServices.some(
      (service) => service.organization_id !== organization.id,
    )
  ) {
    throw new Error(
      "Cannot seed demo Services: a fixed ID belongs to another Organization",
    );
  }

  const existingResources = await trx
    .selectFrom("resource")
    .select(["id", "organization_id"])
    .where(
      "id",
      "in",
      resources.map((resource) => resource.id),
    )
    .execute();

  if (
    existingResources.some(
      (resource) => resource.organization_id !== organization.id,
    )
  ) {
    throw new Error(
      "Cannot seed demo Resources: a fixed ID belongs to another Organization",
    );
  }
}

async function seedDevelopment(trx: Transaction<Database>) {
  await assertSeedOwnership(trx);

  await trx
    .insertInto("organization")
    .values({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      staff_team_visibility: "team",
      pricing_enabled: true,
      slot_interval_minutes: 15,
      min_booking_notice_minutes: 0,
      max_booking_horizon_days: 60,
      public_booking_paused: false,
      cancellation_cutoff_minutes: 0,
      published_at: publishedAt,
      suspended_at: null,
      archived_at: null,
    })
    .onConflict((conflict) =>
      conflict.column("id").doUpdateSet({
        name: organization.name,
        slug: organization.slug,
        staff_team_visibility: "team",
        pricing_enabled: true,
        slot_interval_minutes: 15,
        min_booking_notice_minutes: 0,
        max_booking_horizon_days: 60,
        public_booking_paused: false,
        cancellation_cutoff_minutes: 0,
        published_at: publishedAt,
        suspended_at: null,
        archived_at: null,
      }),
    )
    .execute();

  for (const service of services) {
    await trx
      .insertInto("service")
      .values({
        ...service,
        organization_id: organization.id,
        deactivated_at: null,
      })
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          name: service.name,
          duration_minutes: service.duration_minutes,
          price_agorot: service.price_agorot,
          buffer_after_minutes: service.buffer_after_minutes,
          display_order: service.display_order,
          deactivated_at: null,
        }),
      )
      .execute();
  }

  for (const resource of resources) {
    await trx
      .insertInto("resource")
      .values({
        ...resource,
        organization_id: organization.id,
        user_id: null,
        deactivated_at: null,
      })
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          name: resource.name,
          user_id: null,
          deactivated_at: null,
        }),
      )
      .execute();
  }

  await trx
    .deleteFrom("resource_service")
    .where("resource_id", "=", resources[1].id)
    .where("service_id", "=", services[1].id)
    .execute();

  await trx
    .insertInto("resource_service")
    .values(
      assignments.map((assignment) => ({
        ...assignment,
        organization_id: organization.id,
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(["resource_id", "service_id"]).doNothing(),
    )
    .execute();

  await trx
    .deleteFrom("organization_weekly_hours")
    .where("organization_id", "=", organization.id)
    .execute();
  await trx
    .insertInto("organization_weekly_hours")
    .values(weeklyHours)
    .execute();
}

try {
  await db.transaction().execute(seedDevelopment);

  console.log(`Schedlane development seed ready

Organization: ${organization.name}
Slug: ${organization.slug}
Services: ${services.length}
Resources: ${resources.length}

Public booking context:
http://localhost:3000/api/public/organizations/${organization.slug}/booking-context`);
} finally {
  await db.destroy();
}
