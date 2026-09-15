import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import type { MembershipRole } from "../../src/db-types.js";

type CreateTestUserInput = {
  id?: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
  image?: string | null;
};

export async function createTestUser({
  id = randomUUID(),
  name = "Test user",
  email = `${id}@example.test`,
  emailVerified = true,
  image = null,
}: CreateTestUserInput = {}) {
  return db
    .insertInto("user")
    .values({ id, name, email, emailVerified, image })
    .returningAll()
    .executeTakeFirstOrThrow();
}

type CreateTestOrganizationInput = {
  slug?: string;
  name?: string;
  pricingEnabled?: boolean;
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  suspendedAt?: Date | null;
};

export async function createTestOrganization({
  slug = `test-organization-${randomUUID()}`,
  name = "Test organization",
  pricingEnabled = false,
  publishedAt = null,
  archivedAt = null,
  suspendedAt = null,
}: CreateTestOrganizationInput = {}) {
  return db
    .insertInto("organization")
    .values({
      slug,
      name,
      pricing_enabled: pricingEnabled,
      published_at: publishedAt,
      archived_at: archivedAt,
      suspended_at: suspendedAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

type AddTestMembershipInput = {
  organizationId: string;
  userId: string;
  role: MembershipRole;
};

export async function addTestMembership({
  organizationId,
  userId,
  role,
}: AddTestMembershipInput) {
  return db
    .insertInto("membership")
    .values({ organization_id: organizationId, user_id: userId, role })
    .returningAll()
    .executeTakeFirstOrThrow();
}

type CreateTestResourceInput = {
  organizationId: string;
  userId?: string | null;
  name?: string;
  deactivatedAt?: Date | null;
};

export async function createTestResource({
  organizationId,
  userId = null,
  name = "Test resource",
  deactivatedAt = null,
}: CreateTestResourceInput) {
  return db
    .insertInto("resource")
    .values({
      organization_id: organizationId,
      user_id: userId,
      name,
      deactivated_at: deactivatedAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

type CreateTestServiceInput = {
  organizationId: string;
  name?: string;
  durationMinutes?: number;
  priceAgorot?: number | null;
  bufferAfterMinutes?: number;
  displayOrder?: number;
  deactivatedAt?: Date | null;
};

export async function createTestService({
  organizationId,
  name = "Test service",
  durationMinutes = 30,
  priceAgorot = null,
  bufferAfterMinutes = 0,
  displayOrder = 0,
  deactivatedAt = null,
}: CreateTestServiceInput) {
  return db
    .insertInto("service")
    .values({
      organization_id: organizationId,
      name,
      duration_minutes: durationMinutes,
      price_agorot: priceAgorot,
      buffer_after_minutes: bufferAfterMinutes,
      display_order: displayOrder,
      deactivated_at: deactivatedAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
