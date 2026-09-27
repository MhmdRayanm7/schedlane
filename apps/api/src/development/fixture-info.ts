import type { Kysely } from "kysely";
import { DateTime } from "luxon";
import { config } from "../config.js";
import { db as defaultDb } from "../db.js";
import type { Database } from "../db-types.js";
import { decryptGuestManagementToken } from "../modules/bookings/domain/management-token.js";
import { SCHEDULING_TIMEZONE } from "../modules/bookings/domain/time.js";
import {
  FIXTURE_ORGANIZATIONS,
  FIXTURE_PASSWORD,
  FIXTURE_USERS,
} from "./fixtures-matrix.js";
import { assertSafeDevelopmentEnvironment } from "./safety.js";

export interface FixtureInfoData {
  webOrigin: string;
  apiOrigin: string;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    publishedAt: Date | null;
    suspendedAt: Date | null;
    publicBookingPaused: boolean;
    pricingEnabled: boolean;
  }>;
  bookings: Array<{
    id: string;
    publicReference: string;
    status: string;
    source: string;
    startAt: Date;
    serviceEndAt: Date;
    guestName: string | null;
    guestEmail: string | null;
    managementUrl: string | null;
    serviceName: string;
    resourceName: string;
  }>;
  pendingRequests: number;
  pendingPublications: number;
}

export async function getFixtureInfo(options?: {
  db?: Kysely<Database>;
  skipSafetyAssert?: boolean;
}): Promise<FixtureInfoData> {
  if (!options?.skipSafetyAssert) {
    assertSafeDevelopmentEnvironment();
  }

  const database = options?.db ?? defaultDb;
  const webOrigin = config.WEB_ORIGIN;
  const apiOrigin = `http://${config.HOST === "0.0.0.0" ? "localhost" : config.HOST}:${config.PORT}`;

  const orgs = await database
    .selectFrom("organization")
    .select([
      "id",
      "name",
      "slug",
      "published_at",
      "suspended_at",
      "public_booking_paused",
      "pricing_enabled",
    ])
    .where(
      "id",
      "in",
      Object.values(FIXTURE_ORGANIZATIONS).map((o) => o.id),
    )
    .execute();

  const bookingsRaw = await database
    .selectFrom("booking")
    .innerJoin("service", "service.id", "booking.service_id")
    .innerJoin("resource", "resource.id", "booking.resource_id")
    .select([
      "booking.id",
      "booking.public_reference",
      "booking.status",
      "booking.source",
      "booking.start_at",
      "booking.service_end_at",
      "booking.guest_name",
      "booking.guest_email",
      "booking.guest_management_token_encrypted",
      "service.name as service_name",
      "resource.name as resource_name",
    ])
    .where("booking.organization_id", "=", FIXTURE_ORGANIZATIONS.demoBarbers.id)
    .orderBy("booking.start_at", "asc")
    .execute();

  const bookings = bookingsRaw.map((b) => {
    let managementUrl: string | null = null;
    if (b.guest_management_token_encrypted) {
      try {
        const rawToken = decryptGuestManagementToken(
          b.guest_management_token_encrypted,
          config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY,
        );
        managementUrl = `${webOrigin}/booking/manage#token=${encodeURIComponent(rawToken)}`;
      } catch {
        managementUrl = null;
      }
    }

    return {
      id: b.id,
      publicReference: b.public_reference,
      status: b.status,
      source: b.source,
      startAt: b.start_at,
      serviceEndAt: b.service_end_at,
      guestName: b.guest_name,
      guestEmail: b.guest_email,
      managementUrl,
      serviceName: b.service_name,
      resourceName: b.resource_name,
    };
  });

  const pendingRequests = await database
    .selectFrom("organization_request")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("status", "=", "pending")
    .executeTakeFirstOrThrow();

  const pendingPublications = await database
    .selectFrom("organization_publication_request")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("status", "=", "pending")
    .executeTakeFirstOrThrow();

  return {
    webOrigin,
    apiOrigin,
    organizations: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      publishedAt: o.published_at,
      suspendedAt: o.suspended_at,
      publicBookingPaused: o.public_booking_paused,
      pricingEnabled: o.pricing_enabled,
    })),
    bookings,
    pendingRequests: Number(pendingRequests.count),
    pendingPublications: Number(pendingPublications.count),
  };
}

export function formatFixtureInfoOutput(info: FixtureInfoData): string {
  const barbersOrg = info.organizations.find(
    (o) => o.slug === FIXTURE_ORGANIZATIONS.demoBarbers.slug,
  );
  const barbersId = barbersOrg?.id ?? FIXTURE_ORGANIZATIONS.demoBarbers.id;
  const clinicId =
    info.organizations.find(
      (o) => o.slug === FIXTURE_ORGANIZATIONS.demoClinic.slug,
    )?.id ?? FIXTURE_ORGANIZATIONS.demoClinic.id;
  const studioId =
    info.organizations.find(
      (o) => o.slug === FIXTURE_ORGANIZATIONS.demoStudio.slug,
    )?.id ?? FIXTURE_ORGANIZATIONS.demoStudio.id;
  const suspendedId =
    info.organizations.find(
      (o) => o.slug === FIXTURE_ORGANIZATIONS.demoSuspended.slug,
    )?.id ?? FIXTURE_ORGANIZATIONS.demoSuspended.id;

  const publicBooking = info.bookings.find(
    (b) => b.publicReference === "BK-DEV-PUB01",
  );
  const manualBooking = info.bookings.find(
    (b) => b.publicReference === "BK-DEV-MAN01",
  );
  const walkInBooking = info.bookings.find(
    (b) => b.publicReference === "BK-DEV-WLK01",
  );

  const formatTzDate = (date: Date) => {
    return DateTime.fromJSDate(date)
      .setZone(SCHEDULING_TIMEZONE)
      .toFormat("yyyy-MM-dd HH:mm");
  };

  return `
==================================================
SCHEDLANE DEVELOPMENT ENVIRONMENT
==================================================

Web:
${info.webOrigin}

API:
${info.apiOrigin}

RabbitMQ:
http://localhost:15672
Username: schedlane
Password: schedlane

Common app password:
${FIXTURE_PASSWORD}

--------------------------------------------------
PLATFORM ADMIN
--------------------------------------------------

Email:
${FIXTURE_USERS.platformAdmin.email}

Password:
${FIXTURE_PASSWORD}

Platform:
${info.webOrigin}/platform/requests

Publications:
${info.webOrigin}/platform/publications

Organizations:
${info.webOrigin}/platform/organizations

--------------------------------------------------
DEMO BARBERS
--------------------------------------------------

Slug:
${FIXTURE_ORGANIZATIONS.demoBarbers.slug}

Public page:
${info.webOrigin}/book/${FIXTURE_ORGANIZATIONS.demoBarbers.slug}

Owner:
${FIXTURE_USERS.barbersOwner.email}

Manager:
${FIXTURE_USERS.barbersManager.email}

Staff:
${FIXTURE_USERS.barbersStaff.email} (linked to Mohammad resource)

Unlinked Staff:
${FIXTURE_USERS.barbersUnlinked.email} (intentionally unlinked to any resource)

Admin booking URL:
${info.webOrigin}/app/${barbersId}/bookings

Settings URL:
${info.webOrigin}/app/${barbersId}/settings

--------------------------------------------------
OTHER ORGANIZATIONS
--------------------------------------------------

Demo Clinic:
  Slug: ${FIXTURE_ORGANIZATIONS.demoClinic.slug}
  State: published, public bookings paused, pricing disabled
  Owner: ${FIXTURE_USERS.clinicOwner.email}
  Public page: ${info.webOrigin}/book/${FIXTURE_ORGANIZATIONS.demoClinic.slug}
  Admin URL: ${info.webOrigin}/app/${clinicId}/bookings

Demo Studio:
  Slug: ${FIXTURE_ORGANIZATIONS.demoStudio.slug}
  State: unpublished, pricing enabled (has 1 pending publication request)
  Owner: ${FIXTURE_USERS.studioOwner.email}
  Admin URL: ${info.webOrigin}/app/${studioId}/bookings

Demo Suspended:
  Slug: ${FIXTURE_ORGANIZATIONS.demoSuspended.slug}
  State: published + suspended (independent lifecycle)
  Owner: ${FIXTURE_USERS.suspendedOwner.email}
  Admin URL: ${info.webOrigin}/app/${suspendedId}/bookings

--------------------------------------------------
ONBOARDING ACCOUNTS
--------------------------------------------------

Fresh applicant:
  Email: ${FIXTURE_USERS.applicantNew.email}
  State: No organization, no request (ready to test fresh onboarding)

Pending applicant:
  Email: ${FIXTURE_USERS.applicantPending.email}
  State: Pending request ("Pending Demo Business")
  Platform review: ${info.webOrigin}/platform/requests

Rejected applicant:
  Email: ${FIXTURE_USERS.applicantRejected.email}
  State: Historical rejected request ("Rejected Demo Business")
  Rejection reason: "Please provide a clearer description of the services you plan to offer."

--------------------------------------------------
GUEST MANAGEMENT
--------------------------------------------------

Public Booking:
  Guest: ${publicBooking?.guestName ?? "Daniel Cohen"} (${publicBooking?.guestEmail ?? "guest.public@schedlane.test"})
  Booking reference: ${publicBooking?.publicReference ?? "BK-DEV-PUB01"}
  Management URL:
  ${publicBooking?.managementUrl ?? "Not available"}

Manual Booking:
  Guest: ${manualBooking?.guestName ?? "Sarah Levi"} (${manualBooking?.guestEmail ?? "guest.manual@schedlane.test"})
  Booking reference: ${manualBooking?.publicReference ?? "BK-DEV-MAN01"}
  Management URL:
  ${manualBooking?.managementUrl ?? "Not available"}

Walk-in:
  Guest: NULL identity in database (displayed as Walk-in in UI)
  Booking reference: ${walkInBooking?.publicReference ?? "BK-DEV-WLK01"}
  Management URL:
  No guest-management link by design.

--------------------------------------------------
SEEDED BOOKING DATES (${SCHEDULING_TIMEZONE})
--------------------------------------------------
${info.bookings
  .map(
    (b) =>
      `  ${formatTzDate(b.startAt)}  [${b.status.padEnd(9)}] ${b.serviceName} (${b.resourceName}) - ${b.guestName ?? "Walk-in (NULL)"} (${b.publicReference})`,
  )
  .join("\n")}
==================================================
`.trim();
}
