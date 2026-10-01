import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationsQueryKey } from "@/features/organizations/hooks/use-organizations";
import type { OrganizationsResponse } from "@/features/organizations/types";
import { teamKeys } from "@/features/team/hooks/use-team";
import {
  archiveOrganization,
  createBookingShareLink,
  getBookingShareLinks,
  getOrganizationSettings,
  getPublicationReadiness,
  getPublicationStatus,
  renameOrganization,
  requestPublication,
  restoreOrganization,
  revokeBookingShareLink,
  updateOrganizationPricing,
  updateStaffTeamVisibility,
} from "../api/settings-api";
import type {
  CreateBookingShareLinkInput,
  StaffTeamVisibility,
} from "../types";

export const organizationSettingsKeys = {
  detail: (organizationId: string) =>
    ["organizations", organizationId, "settings"] as const,
};

export const publicationKeys = {
  readiness: (organizationId: string) =>
    ["organizations", organizationId, "publication-readiness"] as const,
  status: (organizationId: string) =>
    ["organizations", organizationId, "publication-status"] as const,
};

export const bookingShareLinkKeys = {
  list: (organizationId: string) =>
    ["organizations", organizationId, "booking-share-links"] as const,
};

export function useBookingShareLinks(organizationId: string, enabled = true) {
  return useQuery({
    queryKey: bookingShareLinkKeys.list(organizationId),
    queryFn: ({ signal }) => getBookingShareLinks(organizationId, signal),
    enabled: Boolean(organizationId && enabled),
  });
}

export function useCreateBookingShareLink(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingShareLinkInput) =>
      createBookingShareLink(organizationId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: bookingShareLinkKeys.list(organizationId),
      }),
  });
}

export function useRevokeBookingShareLink(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      revokeBookingShareLink(organizationId, linkId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: bookingShareLinkKeys.list(organizationId),
      }),
  });
}

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

export function useUpdateOrganizationPricing(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pricingEnabled: boolean) =>
      updateOrganizationPricing(organizationId, pricingEnabled),
    onSuccess: (result) => {
      queryClient.setQueryData(
        organizationSettingsKeys.detail(organizationId),
        (current: { pricingEnabled: boolean } | undefined) =>
          current
            ? { ...current, pricingEnabled: result.pricingEnabled }
            : current,
      );
      void queryClient.invalidateQueries({
        queryKey: publicationKeys.readiness(organizationId),
      });
    },
  });
}

export function usePublicationReadiness(organizationId: string) {
  return useQuery({
    queryKey: publicationKeys.readiness(organizationId),
    queryFn: ({ signal }) => getPublicationReadiness(organizationId, signal),
    enabled: Boolean(organizationId),
  });
}

export function usePublicationStatus(organizationId: string) {
  return useQuery({
    queryKey: publicationKeys.status(organizationId),
    queryFn: ({ signal }) => getPublicationStatus(organizationId, signal),
    enabled: Boolean(organizationId),
  });
}

export function useRequestPublication(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestPublication(organizationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: publicationKeys.status(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: publicationKeys.readiness(organizationId),
        }),
      ]);
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: publicationKeys.status(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: publicationKeys.readiness(organizationId),
        }),
      ]);
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
