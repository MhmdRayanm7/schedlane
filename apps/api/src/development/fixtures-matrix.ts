import { DateTime } from "luxon";
import type { MembershipRole } from "../db-types.js";
import {
  localBookingStartToUtc,
  SCHEDULING_TIMEZONE,
} from "../modules/bookings/domain/time.js";

export const FIXTURE_PASSWORD = "SchedlaneDev123!";

export interface FixtureUserDefinition {
  email: string;
  name: string;
  roleDescription: string;
  organizationSlug?: string;
  membershipRole?: MembershipRole;
  isPlatformAdmin?: boolean;
}

export const FIXTURE_USERS = {
  platformAdmin: {
    email: "platform.admin@schedlane.test",
    name: "Platform Admin",
    roleDescription: "Platform Admin (global operations)",
    isPlatformAdmin: true,
  },
  barbersOwner: {
    email: "barbers.owner@schedlane.test",
    name: "Barbers Owner",
    roleDescription: "Owner of Schedlane Demo Barbers",
    organizationSlug: "demo-barbers",
    membershipRole: "owner",
  },
  barbersManager: {
    email: "barbers.manager@schedlane.test",
    name: "Barbers Manager",
    roleDescription: "Manager of Schedlane Demo Barbers",
    organizationSlug: "demo-barbers",
    membershipRole: "manager",
  },
  barbersStaff: {
    email: "barbers.staff@schedlane.test",
    name: "Barbers Staff",
    roleDescription: "Staff member linked to Mohammad resource",
    organizationSlug: "demo-barbers",
    membershipRole: "staff",
  },
  barbersUnlinked: {
    email: "barbers.unlinked@schedlane.test",
    name: "Unlinked Staff",
    roleDescription: "Staff member intentionally unlinked to any resource",
    organizationSlug: "demo-barbers",
    membershipRole: "staff",
  },
  clinicOwner: {
    email: "clinic.owner@schedlane.test",
    name: "Clinic Owner",
    roleDescription: "Owner of Schedlane Demo Clinic",
    organizationSlug: "demo-clinic",
    membershipRole: "owner",
  },
  studioOwner: {
    email: "studio.owner@schedlane.test",
    name: "Studio Owner",
    roleDescription: "Owner of Schedlane Demo Studio",
    organizationSlug: "demo-studio",
    membershipRole: "owner",
  },
  suspendedOwner: {
    email: "suspended.owner@schedlane.test",
    name: "Suspended Owner",
    roleDescription: "Owner of Schedlane Demo Suspended",
    organizationSlug: "demo-suspended",
    membershipRole: "owner",
  },
  applicantNew: {
    email: "applicant.new@schedlane.test",
    name: "New Applicant",
    roleDescription: "Fresh applicant without an organization or request",
  },
  applicantPending: {
    email: "applicant.pending@schedlane.test",
    name: "Pending Applicant",
    roleDescription: "Applicant with one pending organization request",
  },
  applicantRejected: {
    email: "applicant.rejected@schedlane.test",
    name: "Rejected Applicant",
    roleDescription:
      "Applicant with a historically rejected organization request",
  },
} as const satisfies Record<string, FixtureUserDefinition>;

export const FIXTURE_ORGANIZATIONS = {
  demoBarbers: {
    id: "00000000-0000-7000-8000-000000000001",
    name: "Schedlane Demo Barbers",
    slug: "demo-barbers",
    pricingEnabled: true,
    publicBookingPaused: false,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    suspendedAt: null,
    archivedAt: null,
    slotIntervalMinutes: 15,
    minBookingNoticeMinutes: 0,
    maxBookingHorizonDays: 60,
    cancellationCutoffMinutes: 0,
    staffTeamVisibility: "team" as const,
  },
  demoClinic: {
    id: "00000000-0000-7000-8000-000000000002",
    name: "Schedlane Demo Clinic",
    slug: "demo-clinic",
    pricingEnabled: false,
    publicBookingPaused: true,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    suspendedAt: null,
    archivedAt: null,
    slotIntervalMinutes: 15,
    minBookingNoticeMinutes: 0,
    maxBookingHorizonDays: 60,
    cancellationCutoffMinutes: 0,
    staffTeamVisibility: "team" as const,
  },
  demoStudio: {
    id: "00000000-0000-7000-8000-000000000003",
    name: "Schedlane Demo Studio",
    slug: "demo-studio",
    pricingEnabled: true,
    publicBookingPaused: false,
    publishedAt: null,
    suspendedAt: null,
    archivedAt: null,
    slotIntervalMinutes: 15,
    minBookingNoticeMinutes: 0,
    maxBookingHorizonDays: 60,
    cancellationCutoffMinutes: 0,
    staffTeamVisibility: "team" as const,
  },
  demoSuspended: {
    id: "00000000-0000-7000-8000-000000000004",
    name: "Schedlane Demo Suspended",
    slug: "demo-suspended",
    pricingEnabled: true,
    publicBookingPaused: false,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    suspendedAt: new Date("2026-02-01T00:00:00.000Z"),
    archivedAt: null,
    slotIntervalMinutes: 15,
    minBookingNoticeMinutes: 0,
    maxBookingHorizonDays: 60,
    cancellationCutoffMinutes: 0,
    staffTeamVisibility: "team" as const,
  },
} as const;

export const FIXTURE_SERVICES = {
  // Barbers
  haircut: {
    id: "00000000-0000-7000-8000-000000000101",
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
    name: "Haircut",
    durationMinutes: 30,
    priceAgorot: 7000,
    bufferAfterMinutes: 0,
    displayOrder: 0,
  },
  beardTrim: {
    id: "00000000-0000-7000-8000-000000000102",
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
    name: "Beard Trim",
    durationMinutes: 20,
    priceAgorot: 4000,
    bufferAfterMinutes: 0,
    displayOrder: 1,
  },
  hairAndBeard: {
    id: "00000000-0000-7000-8000-000000000103",
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
    name: "Hair + Beard",
    durationMinutes: 45,
    priceAgorot: 10000,
    bufferAfterMinutes: 0,
    displayOrder: 2,
  },

  // Clinic (stores prices internally even though pricing_enabled is false)
  consultation: {
    id: "00000000-0000-7000-8000-000000000111",
    organizationId: FIXTURE_ORGANIZATIONS.demoClinic.id,
    name: "Consultation",
    durationMinutes: 45,
    priceAgorot: 25000,
    bufferAfterMinutes: 15,
    displayOrder: 0,
  },
  followUp: {
    id: "00000000-0000-7000-8000-000000000112",
    organizationId: FIXTURE_ORGANIZATIONS.demoClinic.id,
    name: "Follow-up",
    durationMinutes: 30,
    priceAgorot: 15000,
    bufferAfterMinutes: 0,
    displayOrder: 1,
  },

  // Studio
  recordingSession: {
    id: "00000000-0000-7000-8000-000000000121",
    organizationId: FIXTURE_ORGANIZATIONS.demoStudio.id,
    name: "Recording Session",
    durationMinutes: 60,
    priceAgorot: 15000,
    bufferAfterMinutes: 15,
    displayOrder: 0,
  },

  // Suspended
  standardSession: {
    id: "00000000-0000-7000-8000-000000000131",
    organizationId: FIXTURE_ORGANIZATIONS.demoSuspended.id,
    name: "Standard Session",
    durationMinutes: 30,
    priceAgorot: 5000,
    bufferAfterMinutes: 0,
    displayOrder: 0,
  },
} as const;

export const FIXTURE_RESOURCES = {
  // Barbers
  mohammad: {
    id: "00000000-0000-7000-8000-000000000201",
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
    name: "Mohammad",
    linkStaffUserEmail: "barbers.staff@schedlane.test",
  },
  ahmad: {
    id: "00000000-0000-7000-8000-000000000202",
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
    name: "Ahmad",
  },
  omar: {
    id: "00000000-0000-7000-8000-000000000203",
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
    name: "Omar",
  },

  // Clinic
  drRami: {
    id: "00000000-0000-7000-8000-000000000211",
    organizationId: FIXTURE_ORGANIZATIONS.demoClinic.id,
    name: "Dr. Rami",
  },

  // Studio
  studioA: {
    id: "00000000-0000-7000-8000-000000000221",
    organizationId: FIXTURE_ORGANIZATIONS.demoStudio.id,
    name: "Studio A",
  },

  // Suspended
  desk1: {
    id: "00000000-0000-7000-8000-000000000231",
    organizationId: FIXTURE_ORGANIZATIONS.demoSuspended.id,
    name: "Desk 1",
  },
} as const;

export const FIXTURE_RESOURCE_SERVICES = [
  // Barbers
  {
    resourceId: FIXTURE_RESOURCES.mohammad.id,
    serviceId: FIXTURE_SERVICES.haircut.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
  },
  {
    resourceId: FIXTURE_RESOURCES.ahmad.id,
    serviceId: FIXTURE_SERVICES.haircut.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
  },
  {
    resourceId: FIXTURE_RESOURCES.omar.id,
    serviceId: FIXTURE_SERVICES.haircut.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
  },
  {
    resourceId: FIXTURE_RESOURCES.mohammad.id,
    serviceId: FIXTURE_SERVICES.beardTrim.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
  },
  {
    resourceId: FIXTURE_RESOURCES.ahmad.id,
    serviceId: FIXTURE_SERVICES.beardTrim.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
  },
  {
    resourceId: FIXTURE_RESOURCES.mohammad.id,
    serviceId: FIXTURE_SERVICES.hairAndBeard.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
  },
  {
    resourceId: FIXTURE_RESOURCES.omar.id,
    serviceId: FIXTURE_SERVICES.hairAndBeard.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoBarbers.id,
  },

  // Clinic
  {
    resourceId: FIXTURE_RESOURCES.drRami.id,
    serviceId: FIXTURE_SERVICES.consultation.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoClinic.id,
  },
  {
    resourceId: FIXTURE_RESOURCES.drRami.id,
    serviceId: FIXTURE_SERVICES.followUp.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoClinic.id,
  },

  // Studio
  {
    resourceId: FIXTURE_RESOURCES.studioA.id,
    serviceId: FIXTURE_SERVICES.recordingSession.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoStudio.id,
  },

  // Suspended
  {
    resourceId: FIXTURE_RESOURCES.desk1.id,
    serviceId: FIXTURE_SERVICES.standardSession.id,
    organizationId: FIXTURE_ORGANIZATIONS.demoSuspended.id,
  },
] as const;

export const FIXTURE_WEEKLY_HOURS = [
  // Sunday (7), Monday (1), Tuesday (2), Wednesday (3), Thursday (4)
  // 09:00 - 17:00 (540 - 1020)
  ...[
    FIXTURE_ORGANIZATIONS.demoBarbers.id,
    FIXTURE_ORGANIZATIONS.demoClinic.id,
    FIXTURE_ORGANIZATIONS.demoStudio.id,
    FIXTURE_ORGANIZATIONS.demoSuspended.id,
  ].flatMap((organizationId) =>
    [7, 1, 2, 3, 4].map((weekday) => ({
      organization_id: organizationId,
      weekday,
      start_minute: 540,
      end_minute: 1020,
    })),
  ),
];

export const FIXTURE_REQUEST_IDS = {
  pendingRequest: "00000000-0000-7000-8000-000000000311",
  rejectedRequest: "00000000-0000-7000-8000-000000000312",
  studioPublicationRequest: "00000000-0000-7000-8000-000000000301",
} as const;

export const FIXTURE_BOOKING_IDS = {
  publicConfirmed: "00000000-0000-7000-8000-000000000401",
  manualWithEmail: "00000000-0000-7000-8000-000000000402",
  manualWalkIn: "00000000-0000-7000-8000-000000000403",
  pastCancelled: "00000000-0000-7000-8000-000000000404",
  pastNoShow: "00000000-0000-7000-8000-000000000405",
} as const;

export function getUpcomingBusinessDay(
  reference: DateTime = DateTime.now().setZone(SCHEDULING_TIMEZONE),
): DateTime {
  let target = reference.plus({ days: 1 }).startOf("day");
  // Weekly hours: Sunday (7), Monday (1), Tuesday (2), Wednesday (3), Thursday (4)
  // Friday (5) and Saturday (6) are off.
  while (target.weekday === 5 || target.weekday === 6) {
    target = target.plus({ days: 1 });
  }
  return target;
}

export function getPreviousBusinessDay(
  reference: DateTime = DateTime.now().setZone(SCHEDULING_TIMEZONE),
): DateTime {
  let target = reference.minus({ days: 1 }).startOf("day");
  while (target.weekday === 5 || target.weekday === 6) {
    target = target.minus({ days: 1 });
  }
  return target;
}

export function computeFixtureBookingTimes(referenceNow?: DateTime) {
  const now = referenceNow ?? DateTime.now().setZone(SCHEDULING_TIMEZONE);
  const nextBusinessDay = getUpcomingBusinessDay(now);
  const prevBusinessDay = getPreviousBusinessDay(now);

  const nextDateStr = nextBusinessDay.toFormat("yyyy-MM-dd");
  const prevDateStr = prevBusinessDay.toFormat("yyyy-MM-dd");

  const publicConfirmedStart = localBookingStartToUtc(nextDateStr, 600); // 10:00
  const manualWithEmailStart = localBookingStartToUtc(nextDateStr, 660); // 11:00
  const manualWalkInStart = localBookingStartToUtc(nextDateStr, 840); // 14:00

  const pastCancelledStart = localBookingStartToUtc(prevDateStr, 600); // 10:00
  const pastCancelledAt = localBookingStartToUtc(prevDateStr, 510); // 08:30
  const pastNoShowStart = localBookingStartToUtc(prevDateStr, 720); // 12:00

  if (
    !publicConfirmedStart ||
    !manualWithEmailStart ||
    !manualWalkInStart ||
    !pastCancelledStart ||
    !pastCancelledAt ||
    !pastNoShowStart
  ) {
    throw new Error(
      "Failed to calculate valid Asia/Jerusalem UTC timestamps for fixture bookings",
    );
  }

  return {
    nextDateStr,
    prevDateStr,
    publicConfirmedStart,
    manualWithEmailStart,
    manualWalkInStart,
    pastCancelledStart,
    pastCancelledAt,
    pastNoShowStart,
  };
}
