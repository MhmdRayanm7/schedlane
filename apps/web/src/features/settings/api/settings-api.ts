import type { Organization } from "@/features/organizations/types";
import type {
  OrganizationPublicationStatus,
  PublicationReadiness,
} from "@/features/publication/types";
import { apiClient } from "@/shared/api/client";
import type {
  BookingShareLink,
  CreateBookingShareLinkInput,
  OrganizationSettings,
  StaffTeamVisibility,
} from "../types";

export function getOrganizationSettings(
  organizationId: string,
  signal?: AbortSignal,
) {
  return apiClient<OrganizationSettings>(
    `/api/organizations/${organizationId}/settings`,
    { signal },
  );
}

export function renameOrganization(organizationId: string, name: string) {
  return apiClient<Pick<Organization, "id" | "slug" | "name">>(
    `/api/organizations/${organizationId}`,
    { method: "PATCH", body: { name } },
  );
}

export function updateStaffTeamVisibility(
  organizationId: string,
  staffTeamVisibility: StaffTeamVisibility,
) {
  return apiClient<{ staffTeamVisibility: StaffTeamVisibility }>(
    `/api/organizations/${organizationId}/settings/staff-team-visibility`,
    { method: "PATCH", body: { staffTeamVisibility } },
  );
}

export function updateOrganizationPricing(
  organizationId: string,
  pricingEnabled: boolean,
) {
  return apiClient<{ pricingEnabled: boolean }>(
    `/api/organizations/${organizationId}/settings/pricing`,
    { method: "PATCH", body: { pricingEnabled } },
  );
}

export function getPublicationReadiness(
  organizationId: string,
  signal?: AbortSignal,
) {
  return apiClient<PublicationReadiness>(
    `/api/organizations/${organizationId}/publication-readiness`,
    { signal },
  );
}

export function getPublicationStatus(
  organizationId: string,
  signal?: AbortSignal,
) {
  return apiClient<OrganizationPublicationStatus>(
    `/api/organizations/${organizationId}/publication-status`,
    { signal },
  );
}

export function requestPublication(organizationId: string) {
  return apiClient<{
    id: string;
    status: "pending";
    requestedAt: string;
  }>(`/api/organizations/${organizationId}/publication-requests`, {
    method: "POST",
  });
}

export function archiveOrganization(organizationId: string) {
  return apiClient<{ id: string; archivedAt: string }>(
    `/api/organizations/${organizationId}/archive`,
    { method: "POST" },
  );
}

export function restoreOrganization(organizationId: string) {
  return apiClient<{ id: string; archivedAt: null }>(
    `/api/organizations/${organizationId}/restore`,
    { method: "POST" },
  );
}

export function getBookingShareLinks(
  organizationId: string,
  signal?: AbortSignal,
) {
  return apiClient<{ items: BookingShareLink[] }>(
    `/api/organizations/${organizationId}/booking-share-links`,
    { signal },
  );
}

export function createBookingShareLink(
  organizationId: string,
  input: CreateBookingShareLinkInput,
) {
  return apiClient<BookingShareLink>(
    `/api/organizations/${organizationId}/booking-share-links`,
    { method: "POST", body: input },
  );
}

export function revokeBookingShareLink(organizationId: string, linkId: string) {
  return apiClient<BookingShareLink>(
    `/api/organizations/${organizationId}/booking-share-links/${linkId}/revoke`,
    { method: "POST" },
  );
}
