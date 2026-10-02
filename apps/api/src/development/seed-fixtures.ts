import { type Kysely, sql } from "kysely";
import { config } from "../config.js";
import { db as defaultDb } from "../db.js";
import type { Database } from "../db-types.js";
import { auth } from "../modules/auth/auth.js";
import {
  encryptGuestManagementToken,
  generateGuestManagementToken,
  hashGuestManagementToken,
} from "../modules/bookings/domain/management-token.js";
import {
  computeFixtureBookingTimes,
  FIXTURE_BOOKING_IDS,
  FIXTURE_ORGANIZATIONS,
  FIXTURE_PASSWORD,
  FIXTURE_REQUEST_IDS,
  FIXTURE_RESOURCE_SERVICES,
  FIXTURE_RESOURCES,
  FIXTURE_SERVICES,
  FIXTURE_USERS,
  FIXTURE_WEEKLY_HOURS,
  type FixtureUserDefinition,
} from "./fixtures-matrix.js";
import { assertSafeDevelopmentEnvironment } from "./safety.js";

export interface SeedResult {
  tokens: {
    publicToken: string;
    manualToken: string;
  };
  bookingTimes: ReturnType<typeof computeFixtureBookingTimes>;
}

export async function cleanupExistingFixtures(db: Kysely<Database>) {
  const orgIds = Object.values(FIXTURE_ORGANIZATIONS).map((org) => org.id);
  const fixtureEmails = Object.values(FIXTURE_USERS).map((u) => u.email);

  const fixtureUsers = await db
    .selectFrom("user")
    .select(["id", "email"])
    .where("email", "in", fixtureEmails)
    .execute();
  const fixtureUserIds = fixtureUsers.map((u) => u.id);

  // 1. Delete bookings for fixture organizations
  if (orgIds.length > 0) {
    await db
      .deleteFrom("booking")
      .where("organization_id", "in", orgIds)
      .execute();

    // 2. Publication requests
    await db
      .deleteFrom("organization_publication_request")
      .where("organization_id", "in", orgIds)
      .execute();

    // 3. Organization unpublications
    await db
      .deleteFrom("organization_unpublication")
      .where("organization_id", "in", orgIds)
      .execute();
  }

  // 4. Organization requests
  if (fixtureUserIds.length > 0) {
    await db
      .deleteFrom("organization_request")
      .where("requested_by_user_id", "in", fixtureUserIds)
      .execute();
  }

  // 5. Schedules, assignments, services, resources, memberships, organizations
  if (orgIds.length > 0) {
    await db
      .deleteFrom("resource_weekly_hours_interval")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("resource_weekly_hours_override")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("resource_date_override_interval")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("resource_date_override")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("resource_time_block")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("organization_date_override_interval")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("organization_date_override")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("organization_weekly_hours")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("resource_service")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("resource")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("service")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("organization_invitation")
      .where("organization_id", "in", orgIds)
      .execute();
    await db
      .deleteFrom("membership")
      .where("organization_id", "in", orgIds)
      .execute();
  }

  // 6. Platform admin entries
  if (fixtureUserIds.length > 0) {
    await db
      .deleteFrom("platform_admin")
      .where("user_id", "in", fixtureUserIds)
      .execute();
  }

  // 7. Organizations
  if (orgIds.length > 0) {
    await db.deleteFrom("organization").where("id", "in", orgIds).execute();
  }

  // 8. Auth sessions, accounts, and users
  if (fixtureUserIds.length > 0) {
    await sql`delete from session where "userId" in (${sql.join(fixtureUserIds)})`.execute(
      db,
    );
    await sql`delete from account where "userId" in (${sql.join(fixtureUserIds)})`.execute(
      db,
    );
    await db.deleteFrom("user").where("id", "in", fixtureUserIds).execute();
  }

  // 9. Clean outbox and verification
  await db.deleteFrom("outbox_event").execute();
  await sql`delete from verification`.execute(db);
}

export async function seedDevelopmentFixtures(options?: {
  db?: Kysely<Database>;
  skipSafetyAssert?: boolean;
}): Promise<SeedResult> {
  if (!options?.skipSafetyAssert) {
    assertSafeDevelopmentEnvironment();
  }

  const database = options?.db ?? defaultDb;

  // Step 1: Clean up any previous fixture data
  await cleanupExistingFixtures(database);

  // Step 2: Create Better Auth users using official auth.api.signUpEmail
  for (const userDef of Object.values(FIXTURE_USERS)) {
    await auth.api.signUpEmail({
      body: {
        email: userDef.email,
        password: FIXTURE_PASSWORD,
        name: userDef.name,
      },
    });
  }

  // Step 3: Mark fixture users emailVerified = true and clear sessions
  const createdUsers = await database
    .selectFrom("user")
    .select(["id", "email", "name"])
    .execute();

  const userByEmail = new Map(
    createdUsers.map((user) => [user.email.toLowerCase(), user]),
  );

  for (const user of createdUsers) {
    await database
      .updateTable("user")
      .set({ emailVerified: true })
      .where("id", "=", user.id)
      .execute();
  }

  // Strictly avoid seeding sessions
  await sql`delete from session`.execute(database);

  // Strictly avoid outbox email flooding on startup
  await database.deleteFrom("outbox_event").execute();
  await sql`delete from verification`.execute(database);

  // Step 4: Seed Platform Admin
  const platformAdminUser = userByEmail.get(
    FIXTURE_USERS.platformAdmin.email.toLowerCase(),
  );
  if (!platformAdminUser) {
    throw new Error("Failed to find created Platform Admin user");
  }

  await database
    .insertInto("platform_admin")
    .values({
      user_id: platformAdminUser.id,
      revoked_at: null,
    })
    .execute();

  // Step 5: Seed Organizations
  for (const org of Object.values(FIXTURE_ORGANIZATIONS)) {
    await database
      .insertInto("organization")
      .values({
        id: org.id,
        name: org.name,
        slug: org.slug,
        staff_team_visibility: org.staffTeamVisibility,
        pricing_enabled: org.pricingEnabled,
        slot_interval_minutes: org.slotIntervalMinutes,
        min_booking_notice_minutes: org.minBookingNoticeMinutes,
        max_booking_horizon_days: org.maxBookingHorizonDays,
        public_booking_paused: org.publicBookingPaused,
        cancellation_cutoff_minutes: org.cancellationCutoffMinutes,
        published_at: org.publishedAt,
        suspended_at: org.suspendedAt,
        archived_at: org.archivedAt,
      })
      .execute();
  }

  // Step 6: Seed Memberships
  for (const userDef of Object.values(
    FIXTURE_USERS,
  ) as readonly FixtureUserDefinition[]) {
    if (!userDef.organizationSlug || !userDef.membershipRole) continue;

    const user = userByEmail.get(userDef.email.toLowerCase());
    const org = Object.values(FIXTURE_ORGANIZATIONS).find(
      (o) => o.slug === userDef.organizationSlug,
    );
    if (!user || !org) {
      throw new Error(
        `Failed to link membership: user ${userDef.email} or org ${userDef.organizationSlug} not found`,
      );
    }

    await database
      .insertInto("membership")
      .values({
        organization_id: org.id,
        user_id: user.id,
        role: userDef.membershipRole,
      })
      .execute();
  }

  // Step 7: Seed Services
  for (const service of Object.values(FIXTURE_SERVICES)) {
    await database
      .insertInto("service")
      .values({
        id: service.id,
        organization_id: service.organizationId,
        name: service.name,
        duration_minutes: service.durationMinutes,
        price_agorot: service.priceAgorot,
        buffer_after_minutes: service.bufferAfterMinutes,
        display_order: service.displayOrder,
        deactivated_at: null,
      })
      .execute();
  }

  // Step 8: Seed Resources (link barbers.staff to Mohammad)
  const barbersStaffUser = userByEmail.get(
    FIXTURE_USERS.barbersStaff.email.toLowerCase(),
  );

  for (const resource of Object.values(FIXTURE_RESOURCES)) {
    const linkedUserId =
      resource.name === "Mohammad" ? (barbersStaffUser?.id ?? null) : null;

    await database
      .insertInto("resource")
      .values({
        id: resource.id,
        organization_id: resource.organizationId,
        name: resource.name,
        user_id: linkedUserId,
        deactivated_at: null,
      })
      .execute();
  }

  // Step 9: Seed Resource-Service Assignments
  for (const item of FIXTURE_RESOURCE_SERVICES) {
    await database
      .insertInto("resource_service")
      .values({
        organization_id: item.organizationId,
        resource_id: item.resourceId,
        service_id: item.serviceId,
      })
      .execute();
  }

  // Step 10: Seed Weekly Hours
  await database
    .insertInto("organization_weekly_hours")
    .values(FIXTURE_WEEKLY_HOURS)
    .execute();

  // Step 11: Seed Organization Requests
  const pendingApplicant = userByEmail.get(
    FIXTURE_USERS.applicantPending.email.toLowerCase(),
  );
  if (!pendingApplicant) {
    throw new Error("Pending applicant user not found");
  }

  await database
    .insertInto("organization_request")
    .values({
      id: FIXTURE_REQUEST_IDS.pendingRequest,
      requested_by_user_id: pendingApplicant.id,
      name: "Pending Demo Business",
      description:
        "High-end barbershop and grooming lounge offering classic cuts and modern styling.",
      contact_phone: "+972501234567",
      additional_context: "Looking to set up online booking for 3 barbers.",
      wants_setup_help: true,
      status: "pending",
      reviewed_by_user_id: null,
      organization_id: null,
      rejection_reason: null,
      decided_at: null,
    })
    .execute();

  const rejectedApplicant = userByEmail.get(
    FIXTURE_USERS.applicantRejected.email.toLowerCase(),
  );
  if (!rejectedApplicant) {
    throw new Error("Rejected applicant user not found");
  }

  await database
    .insertInto("organization_request")
    .values({
      id: FIXTURE_REQUEST_IDS.rejectedRequest,
      requested_by_user_id: rejectedApplicant.id,
      name: "Rejected Demo Business",
      description: "Barbershop and salon services for the local neighborhood.",
      contact_phone: "+972509876543",
      additional_context: "Need online booking.",
      wants_setup_help: false,
      status: "rejected",
      reviewed_by_user_id: platformAdminUser.id,
      organization_id: null,
      rejection_reason:
        "Please provide a clearer description of the services you plan to offer.",
      decided_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    })
    .execute();

  // Step 12: Seed Publication Request for demo-studio
  const studioOwner = userByEmail.get(
    FIXTURE_USERS.studioOwner.email.toLowerCase(),
  );
  if (!studioOwner) {
    throw new Error("Studio owner user not found");
  }

  await database
    .insertInto("organization_publication_request")
    .values({
      id: FIXTURE_REQUEST_IDS.studioPublicationRequest,
      organization_id: FIXTURE_ORGANIZATIONS.demoStudio.id,
      requested_by_user_id: studioOwner.id,
      status: "pending",
      requested_at: new Date(Date.now() - 3600000),
      reviewed_by_user_id: null,
      reviewed_at: null,
      rejection_reason: null,
    })
    .execute();

  // Step 13: Seed Bookings in demo-barbers
  const barbersManager = userByEmail.get(
    FIXTURE_USERS.barbersManager.email.toLowerCase(),
  );
  if (!barbersManager) {
    throw new Error("Barbers manager user not found");
  }

  const barbersStaff = userByEmail.get(
    FIXTURE_USERS.barbersStaff.email.toLowerCase(),
  );
  if (!barbersStaff) {
    throw new Error("Barbers staff user not found");
  }

  const bookingTimes = computeFixtureBookingTimes();

  // Generate tokens using existing cryptographic standard
  const publicToken = generateGuestManagementToken();
  const publicHash = hashGuestManagementToken(publicToken);
  const publicEncrypted = encryptGuestManagementToken(
    publicToken,
    config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY,
  );

  const manualToken = generateGuestManagementToken();
  const manualHash = hashGuestManagementToken(manualToken);
  const manualEncrypted = encryptGuestManagementToken(
    manualToken,
    config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY,
  );

  // A. Public Confirmed Booking
  const publicDuration = FIXTURE_SERVICES.haircut.durationMinutes;
  const publicBuffer = FIXTURE_SERVICES.haircut.bufferAfterMinutes;
  await database
    .insertInto("booking")
    .values({
      id: FIXTURE_BOOKING_IDS.publicConfirmed,
      organization_id: FIXTURE_ORGANIZATIONS.demoBarbers.id,
      resource_id: FIXTURE_RESOURCES.mohammad.id,
      service_id: FIXTURE_SERVICES.haircut.id,
      public_reference: "BK-DEV-PUB01",
      status: "confirmed",
      source: "public",
      created_by_user_id: null,
      start_at: bookingTimes.publicConfirmedStart,
      service_end_at: new Date(
        bookingTimes.publicConfirmedStart.getTime() + publicDuration * 60_000,
      ),
      occupied_until_at: new Date(
        bookingTimes.publicConfirmedStart.getTime() +
          (publicDuration + publicBuffer) * 60_000,
      ),
      duration_minutes: publicDuration,
      buffer_after_minutes: publicBuffer,
      price_agorot: FIXTURE_SERVICES.haircut.priceAgorot,
      guest_name: "Daniel Cohen",
      guest_phone: "+972501234567",
      guest_email: "guest.public@schedlane.test",
      customer_note: "First time haircut",
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
      cancellation_cutoff_minutes: 0,
      guest_management_token_hash: publicHash,
      guest_management_token_encrypted: publicEncrypted,
    })
    .execute();

  // B. Manual Booking with Email
  const manualDuration = FIXTURE_SERVICES.haircut.durationMinutes;
  const manualBuffer = FIXTURE_SERVICES.haircut.bufferAfterMinutes;
  await database
    .insertInto("booking")
    .values({
      id: FIXTURE_BOOKING_IDS.manualWithEmail,
      organization_id: FIXTURE_ORGANIZATIONS.demoBarbers.id,
      resource_id: FIXTURE_RESOURCES.ahmad.id,
      service_id: FIXTURE_SERVICES.haircut.id,
      public_reference: "BK-DEV-MAN01",
      status: "confirmed",
      source: "manual",
      created_by_user_id: barbersManager.id,
      start_at: bookingTimes.manualWithEmailStart,
      service_end_at: new Date(
        bookingTimes.manualWithEmailStart.getTime() + manualDuration * 60_000,
      ),
      occupied_until_at: new Date(
        bookingTimes.manualWithEmailStart.getTime() +
          (manualDuration + manualBuffer) * 60_000,
      ),
      duration_minutes: manualDuration,
      buffer_after_minutes: manualBuffer,
      price_agorot: FIXTURE_SERVICES.haircut.priceAgorot,
      guest_name: "Sarah Levi",
      guest_phone: "+972522345678",
      guest_email: "guest.manual@schedlane.test",
      customer_note: "Booked via phone",
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
      cancellation_cutoff_minutes: 0,
      guest_management_token_hash: manualHash,
      guest_management_token_encrypted: manualEncrypted,
    })
    .execute();

  // C. Manual Walk-in (guest identity explicitly null)
  const walkInDuration = FIXTURE_SERVICES.hairAndBeard.durationMinutes;
  const walkInBuffer = FIXTURE_SERVICES.hairAndBeard.bufferAfterMinutes;
  await database
    .insertInto("booking")
    .values({
      id: FIXTURE_BOOKING_IDS.manualWalkIn,
      organization_id: FIXTURE_ORGANIZATIONS.demoBarbers.id,
      resource_id: FIXTURE_RESOURCES.omar.id,
      service_id: FIXTURE_SERVICES.hairAndBeard.id,
      public_reference: "BK-DEV-WLK01",
      status: "confirmed",
      source: "manual",
      created_by_user_id: barbersStaff.id,
      start_at: bookingTimes.manualWalkInStart,
      service_end_at: new Date(
        bookingTimes.manualWalkInStart.getTime() + walkInDuration * 60_000,
      ),
      occupied_until_at: new Date(
        bookingTimes.manualWalkInStart.getTime() +
          (walkInDuration + walkInBuffer) * 60_000,
      ),
      duration_minutes: walkInDuration,
      buffer_after_minutes: walkInBuffer,
      price_agorot: FIXTURE_SERVICES.hairAndBeard.priceAgorot,
      guest_name: null,
      guest_phone: null,
      guest_email: null,
      customer_note: "Walk-in client",
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
      cancellation_cutoff_minutes: 0,
      guest_management_token_hash: null,
      guest_management_token_encrypted: null,
    })
    .execute();

  // D. Past Cancelled Booking
  const cancelledDuration = FIXTURE_SERVICES.beardTrim.durationMinutes;
  const cancelledBuffer = FIXTURE_SERVICES.beardTrim.bufferAfterMinutes;
  await database
    .insertInto("booking")
    .values({
      id: FIXTURE_BOOKING_IDS.pastCancelled,
      organization_id: FIXTURE_ORGANIZATIONS.demoBarbers.id,
      resource_id: FIXTURE_RESOURCES.mohammad.id,
      service_id: FIXTURE_SERVICES.beardTrim.id,
      public_reference: "BK-DEV-CAN01",
      status: "cancelled",
      source: "public",
      created_by_user_id: null,
      start_at: bookingTimes.pastCancelledStart,
      service_end_at: new Date(
        bookingTimes.pastCancelledStart.getTime() + cancelledDuration * 60_000,
      ),
      occupied_until_at: new Date(
        bookingTimes.pastCancelledStart.getTime() +
          (cancelledDuration + cancelledBuffer) * 60_000,
      ),
      duration_minutes: cancelledDuration,
      buffer_after_minutes: cancelledBuffer,
      price_agorot: FIXTURE_SERVICES.beardTrim.priceAgorot,
      guest_name: "Yossi Cohen",
      guest_phone: "+972543456789",
      guest_email: "yossi.cohen@schedlane.test",
      customer_note: null,
      cancelled_at: bookingTimes.pastCancelledAt,
      cancelled_by_user_id: barbersManager.id,
      cancellation_reason: "Customer requested cancellation by phone",
      cancellation_cutoff_minutes: 0,
      guest_management_token_hash: null,
      guest_management_token_encrypted: null,
    })
    .execute();

  // E. Past No-Show Booking
  const noShowDuration = FIXTURE_SERVICES.haircut.durationMinutes;
  const noShowBuffer = FIXTURE_SERVICES.haircut.bufferAfterMinutes;
  await database
    .insertInto("booking")
    .values({
      id: FIXTURE_BOOKING_IDS.pastNoShow,
      organization_id: FIXTURE_ORGANIZATIONS.demoBarbers.id,
      resource_id: FIXTURE_RESOURCES.ahmad.id,
      service_id: FIXTURE_SERVICES.haircut.id,
      public_reference: "BK-DEV-NSH01",
      status: "no_show",
      source: "manual",
      created_by_user_id: barbersManager.id,
      start_at: bookingTimes.pastNoShowStart,
      service_end_at: new Date(
        bookingTimes.pastNoShowStart.getTime() + noShowDuration * 60_000,
      ),
      occupied_until_at: new Date(
        bookingTimes.pastNoShowStart.getTime() +
          (noShowDuration + noShowBuffer) * 60_000,
      ),
      duration_minutes: noShowDuration,
      buffer_after_minutes: noShowBuffer,
      price_agorot: FIXTURE_SERVICES.haircut.priceAgorot,
      guest_name: "Avi Mizrahi",
      guest_phone: "+972534567890",
      guest_email: null,
      customer_note: null,
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
      cancellation_cutoff_minutes: 0,
      guest_management_token_hash: null,
      guest_management_token_encrypted: null,
    })
    .execute();

  // Final check: outbox must remain clean so starting worker causes zero spam
  await database.deleteFrom("outbox_event").execute();

  return {
    tokens: {
      publicToken,
      manualToken,
    },
    bookingTimes,
  };
}
