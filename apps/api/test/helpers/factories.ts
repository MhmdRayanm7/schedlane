import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import type { BookingStatus, MembershipRole } from "../../src/db-types.js";

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
  minBookingNoticeMinutes?: number;
  maxBookingHorizonDays?: number;
  publicBookingPaused?: boolean;
  cancellationCutoffMinutes?: number;
};

export async function createTestOrganization({
  slug = `test-organization-${randomUUID()}`,
  name = "Test organization",
  pricingEnabled = false,
  publishedAt = null,
  archivedAt = null,
  suspendedAt = null,
  minBookingNoticeMinutes,
  maxBookingHorizonDays,
  publicBookingPaused,
  cancellationCutoffMinutes,
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
      min_booking_notice_minutes: minBookingNoticeMinutes,
      max_booking_horizon_days: maxBookingHorizonDays,
      public_booking_paused: publicBookingPaused,
      cancellation_cutoff_minutes: cancellationCutoffMinutes,
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

type CreateTestBookingInput = {
  organizationId: string;
  resourceId: string;
  serviceId: string;
  publicReference: string;
  startAt: Date;
  durationMinutes: number;
  bufferAfterMinutes: number;
  status?: BookingStatus;
  priceAgorot?: number | null;
  guestName?: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  customerNote?: string | null;
  cancelledAt?: Date | null;
  cancelledByUserId?: string | null;
  cancellationReason?: string | null;
  cancellationCutoffMinutes?: number;
  guestManagementTokenHash?: string | null;
  guestManagementTokenEncrypted?: string | null;
};

export async function createTestBooking({
  organizationId,
  resourceId,
  serviceId,
  publicReference,
  startAt,
  durationMinutes,
  bufferAfterMinutes,
  status = "confirmed",
  priceAgorot = null,
  guestName = "Test guest",
  guestPhone = null,
  guestEmail = null,
  customerNote = null,
  cancelledAt = null,
  cancelledByUserId = null,
  cancellationReason = null,
  cancellationCutoffMinutes = 0,
  guestManagementTokenHash = null,
  guestManagementTokenEncrypted = null,
}: CreateTestBookingInput) {
  const serviceEndAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const occupiedUntilAt = new Date(
    serviceEndAt.getTime() + bufferAfterMinutes * 60_000,
  );

  return db
    .insertInto("booking")
    .values({
      organization_id: organizationId,
      resource_id: resourceId,
      service_id: serviceId,
      public_reference: publicReference,
      status,
      start_at: startAt,
      service_end_at: serviceEndAt,
      occupied_until_at: occupiedUntilAt,
      duration_minutes: durationMinutes,
      buffer_after_minutes: bufferAfterMinutes,
      price_agorot: priceAgorot,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail,
      customer_note: customerNote,
      cancelled_at: cancelledAt,
      cancelled_by_user_id: cancelledByUserId,
      cancellation_reason: cancellationReason,
      cancellation_cutoff_minutes: cancellationCutoffMinutes,
      guest_management_token_hash: guestManagementTokenHash,
      guest_management_token_encrypted: guestManagementTokenEncrypted,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
