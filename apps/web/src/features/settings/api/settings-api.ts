import type { Organization } from "@/features/organizations/types";
import { apiClient } from "@/shared/api/client";
import type { OrganizationSettings, StaffTeamVisibility } from "../types";

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
