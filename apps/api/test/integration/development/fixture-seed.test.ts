import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import {
  formatFixtureInfoOutput,
  getFixtureInfo,
} from "../../../src/development/fixture-info.js";
import {
  FIXTURE_BOOKING_IDS,
  FIXTURE_ORGANIZATIONS,
  FIXTURE_PASSWORD,
  FIXTURE_REQUEST_IDS,
  FIXTURE_RESOURCES,
  FIXTURE_USERS,
} from "../../../src/development/fixtures-matrix.js";
import { seedDevelopmentFixtures } from "../../../src/development/seed-fixtures.js";
import { auth } from "../../../src/modules/auth/auth.js";

describe("development fixture seed and info integration", () => {
  it("seeds complete realistic test fixtures and provides read-only info", async () => {
    // 1. Run the seed
    const seedResult = await seedDevelopmentFixtures({
      db,
      skipSafetyAssert: true,
    });
    expect(seedResult.tokens.publicToken).toBeTruthy();
    expect(seedResult.tokens.manualToken).toBeTruthy();

    // 2. Fixture users are verified and can authenticate with common password
    const allFixtureUsers = await db
      .selectFrom("user")
      .select(["id", "email", "name", "emailVerified"])
      .execute();
    expect(allFixtureUsers.length).toBe(Object.keys(FIXTURE_USERS).length);
    for (const u of allFixtureUsers) {
      expect(u.emailVerified).toBe(true);
    }

    // Authenticate a couple representative users
    const signInResult = await auth.api.signInEmail({
      body: {
        email: FIXTURE_USERS.barbersOwner.email,
        password: FIXTURE_PASSWORD,
      },
    });
    expect(signInResult?.user?.email).toBe(FIXTURE_USERS.barbersOwner.email);

    const adminSignIn = await auth.api.signInEmail({
      body: {
        email: FIXTURE_USERS.platformAdmin.email,
        password: FIXTURE_PASSWORD,
      },
    });
    expect(adminSignIn?.user?.email).toBe(FIXTURE_USERS.platformAdmin.email);

    // Platform admin check
    const platformAdmin = await db
      .selectFrom("platform_admin")
      .selectAll()
      .where("user_id", "=", adminSignIn.user.id)
      .executeTakeFirst();
    expect(platformAdmin).toBeDefined();
    expect(platformAdmin?.revoked_at).toBeNull();

    // 3. Roles and memberships
    const userMap = new Map(allFixtureUsers.map((u) => [u.email, u.id]));

    const barbersMemberships = await db
      .selectFrom("membership")
      .select(["user_id", "role"])
      .where("organization_id", "=", FIXTURE_ORGANIZATIONS.demoBarbers.id)
      .execute();
    expect(barbersMemberships).toEqual(
      expect.arrayContaining([
        {
          user_id: userMap.get(FIXTURE_USERS.barbersOwner.email),
          role: "owner",
        },
        {
          user_id: userMap.get(FIXTURE_USERS.barbersManager.email),
          role: "manager",
        },
        {
          user_id: userMap.get(FIXTURE_USERS.barbersStaff.email),
          role: "staff",
        },
        {
          user_id: userMap.get(FIXTURE_USERS.barbersUnlinked.email),
          role: "staff",
        },
      ]),
    );

    // 4. Linked Staff Resource vs Unlinked Staff
    const mohammadResource = await db
      .selectFrom("resource")
      .select(["id", "name", "user_id"])
      .where("id", "=", FIXTURE_RESOURCES.mohammad.id)
      .executeTakeFirstOrThrow();
    expect(mohammadResource.user_id).toBe(
      userMap.get(FIXTURE_USERS.barbersStaff.email),
    );

    const unlinkedStaffUserId = userMap.get(
      FIXTURE_USERS.barbersUnlinked.email,
    );
    expect(unlinkedStaffUserId).toBeDefined();
    const unlinkedResources = await db
      .selectFrom("resource")
      .selectAll()
      .where("user_id", "=", unlinkedStaffUserId!)
      .execute();
    expect(unlinkedResources).toHaveLength(0);

    // 5. Organization lifecycle states
    const orgs = await db.selectFrom("organization").selectAll().execute();
    const orgMap = new Map(orgs.map((o) => [o.slug, o]));

    const barbersOrg = orgMap.get("demo-barbers");
    expect(barbersOrg?.published_at).not.toBeNull();
    expect(barbersOrg?.public_booking_paused).toBe(false);
    expect(barbersOrg?.suspended_at).toBeNull();
    expect(barbersOrg?.archived_at).toBeNull();
    expect(barbersOrg?.pricing_enabled).toBe(true);

    const clinicOrg = orgMap.get("demo-clinic");
    expect(clinicOrg?.published_at).not.toBeNull();
    expect(clinicOrg?.public_booking_paused).toBe(true);
    expect(clinicOrg?.suspended_at).toBeNull();
    expect(clinicOrg?.pricing_enabled).toBe(false);

    const studioOrg = orgMap.get("demo-studio");
    expect(studioOrg?.published_at).toBeNull();
    expect(studioOrg?.public_booking_paused).toBe(false);
    expect(studioOrg?.suspended_at).toBeNull();
    expect(studioOrg?.pricing_enabled).toBe(true);

    const suspendedOrg = orgMap.get("demo-suspended");
    expect(suspendedOrg?.published_at).not.toBeNull();
    expect(suspendedOrg?.suspended_at).not.toBeNull();
    expect(suspendedOrg?.archived_at).toBeNull();

    // 6. Pricing-disabled Organization retains Service prices
    const clinicServices = await db
      .selectFrom("service")
      .selectAll()
      .where("organization_id", "=", FIXTURE_ORGANIZATIONS.demoClinic.id)
      .execute();
    expect(clinicServices.length).toBeGreaterThanOrEqual(2);
    for (const service of clinicServices) {
      expect(service.price_agorot).toBeGreaterThan(0);
    }

    // 7. Onboarding requests
    const pendingReq = await db
      .selectFrom("organization_request")
      .selectAll()
      .where("id", "=", FIXTURE_REQUEST_IDS.pendingRequest)
      .executeTakeFirstOrThrow();
    expect(pendingReq.status).toBe("pending");
    expect(pendingReq.requested_by_user_id).toBe(
      userMap.get(FIXTURE_USERS.applicantPending.email),
    );
    expect(pendingReq.reviewed_by_user_id).toBeNull();

    const rejectedReq = await db
      .selectFrom("organization_request")
      .selectAll()
      .where("id", "=", FIXTURE_REQUEST_IDS.rejectedRequest)
      .executeTakeFirstOrThrow();
    expect(rejectedReq.status).toBe("rejected");
    expect(rejectedReq.requested_by_user_id).toBe(
      userMap.get(FIXTURE_USERS.applicantRejected.email),
    );
    expect(rejectedReq.reviewed_by_user_id).toBe(
      userMap.get(FIXTURE_USERS.platformAdmin.email),
    );
    expect(rejectedReq.rejection_reason).toContain(
      "Please provide a clearer description",
    );

    // 8. Pending publication request for demo-studio
    const pubReq = await db
      .selectFrom("organization_publication_request")
      .selectAll()
      .where("organization_id", "=", FIXTURE_ORGANIZATIONS.demoStudio.id)
      .executeTakeFirstOrThrow();
    expect(pubReq.status).toBe("pending");
    expect(pubReq.requested_by_user_id).toBe(
      userMap.get(FIXTURE_USERS.studioOwner.email),
    );

    // 9. Bookings: sources, creators, identities, tokens, and non-overlapping
    const publicBooking = await db
      .selectFrom("booking")
      .selectAll()
      .where("id", "=", FIXTURE_BOOKING_IDS.publicConfirmed)
      .executeTakeFirstOrThrow();
    expect(publicBooking.source).toBe("public");
    expect(publicBooking.created_by_user_id).toBeNull();
    expect(publicBooking.guest_name).toBe("Daniel Cohen");
    expect(publicBooking.guest_management_token_hash).not.toBeNull();
    expect(publicBooking.guest_management_token_encrypted).not.toBeNull();

    const manualBooking = await db
      .selectFrom("booking")
      .selectAll()
      .where("id", "=", FIXTURE_BOOKING_IDS.manualWithEmail)
      .executeTakeFirstOrThrow();
    expect(manualBooking.source).toBe("manual");
    expect(manualBooking.created_by_user_id).toBe(
      userMap.get(FIXTURE_USERS.barbersManager.email),
    );
    expect(manualBooking.guest_name).toBe("Sarah Levi");
    expect(manualBooking.guest_management_token_hash).not.toBeNull();
    expect(manualBooking.guest_management_token_encrypted).not.toBeNull();

    const walkInBooking = await db
      .selectFrom("booking")
      .selectAll()
      .where("id", "=", FIXTURE_BOOKING_IDS.manualWalkIn)
      .executeTakeFirstOrThrow();
    expect(walkInBooking.source).toBe("manual");
    expect(walkInBooking.created_by_user_id).toBe(
      userMap.get(FIXTURE_USERS.barbersStaff.email),
    );
    // Explicitly NULL identity in DB
    expect(walkInBooking.guest_name).toBeNull();
    expect(walkInBooking.guest_phone).toBeNull();
    expect(walkInBooking.guest_email).toBeNull();
    expect(walkInBooking.guest_management_token_hash).toBeNull();
    expect(walkInBooking.guest_management_token_encrypted).toBeNull();

    const cancelledBooking = await db
      .selectFrom("booking")
      .selectAll()
      .where("id", "=", FIXTURE_BOOKING_IDS.pastCancelled)
      .executeTakeFirstOrThrow();
    expect(cancelledBooking.status).toBe("cancelled");
    expect(cancelledBooking.cancelled_at).not.toBeNull();
    expect(cancelledBooking.cancelled_by_user_id).toBe(
      userMap.get(FIXTURE_USERS.barbersManager.email),
    );

    const noShowBooking = await db
      .selectFrom("booking")
      .selectAll()
      .where("id", "=", FIXTURE_BOOKING_IDS.pastNoShow)
      .executeTakeFirstOrThrow();
    expect(noShowBooking.status).toBe("no_show");
    expect(noShowBooking.cancelled_at).toBeNull();

    // 10. Outbox is completely clean (no spam)
    const outboxEvents = await db
      .selectFrom("outbox_event")
      .selectAll()
      .execute();
    expect(outboxEvents).toHaveLength(0);

    // 11. Read-only info inspection does not mutate data
    const info = await getFixtureInfo({ db, skipSafetyAssert: true });
    expect(info.bookings.length).toBe(5);
    expect(info.organizations.length).toBe(4);

    const outputText = formatFixtureInfoOutput(info);
    expect(outputText).toContain("SCHEDLANE DEVELOPMENT ENVIRONMENT");
    expect(outputText).toContain(FIXTURE_PASSWORD);
    expect(outputText).toContain("/booking/manage#token=");
    expect(outputText).toContain("Walk-in");

    // Re-verify outbox remains clean and no data was mutated
    const outboxAfter = await db
      .selectFrom("outbox_event")
      .selectAll()
      .execute();
    expect(outboxAfter).toHaveLength(0);
  });
});
