import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationsQueryKey } from "@/features/organizations/hooks/use-organizations";
import type { OrganizationsResponse } from "@/features/organizations/types";
import { teamKeys } from "@/features/team/hooks/use-team";
import {
  archiveOrganization,
  getOrganizationSettings,
  renameOrganization,
  restoreOrganization,
  updateStaffTeamVisibility,
} from "../api/settings-api";
import type { StaffTeamVisibility } from "../types";

export const organizationSettingsKeys = {
  detail: (organizationId: string) =>
    ["organizations", organizationId, "settings"] as const,
};

export function useOrganizationSettings(organizationId: string) {
  return useQuery({
    queryKey: organizationSettingsKeys.detail(organizationId),
    queryFn: ({ signal }) => getOrganizationSettings(organizationId, signal),
    enabled: Boolean(organizationId),
  });
}

function updateOrganizationCache(
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
  update: (
    organization: OrganizationsResponse["items"][number],
  ) => OrganizationsResponse["items"][number],
) {
  queryClient.setQueryData<OrganizationsResponse>(
    organizationsQueryKey,
    (current) =>
      current
        ? {
            items: current.items.map((organization) =>
              organization.id === organizationId
                ? update(organization)
                : organization,
            ),
          }
        : current,
  );
  void queryClient.invalidateQueries({ queryKey: organizationsQueryKey });
}

export function useRenameOrganization(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameOrganization(organizationId, name),
    onSuccess: (organization) => {
      updateOrganizationCache(queryClient, organizationId, (current) => ({
        ...current,
        name: organization.name,
      }));
    },
  });
}

export function useUpdateStaffTeamVisibility(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visibility: StaffTeamVisibility) =>
      updateStaffTeamVisibility(organizationId, visibility),
    onSuccess: (result) => {
      queryClient.setQueryData(
        organizationSettingsKeys.detail(organizationId),
        (current: { pricingEnabled: boolean } | undefined) =>
          current
            ? { ...current, staffTeamVisibility: result.staffTeamVisibility }
            : current,
      );
      void queryClient.invalidateQueries({
        queryKey: teamKeys.organization(organizationId),
      });
    },
  });
}

export function useArchiveOrganization(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => archiveOrganization(organizationId),
    onSuccess: (result) => {
      updateOrganizationCache(queryClient, organizationId, (current) => ({
        ...current,
        archivedAt: result.archivedAt,
        publishedAt: null,
      }));
    },
  });
}

export function useRestoreOrganization(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => restoreOrganization(organizationId),
    onSuccess: () => {
      updateOrganizationCache(queryClient, organizationId, (current) => ({
        ...current,
        archivedAt: null,
      }));
    },
  });
}
