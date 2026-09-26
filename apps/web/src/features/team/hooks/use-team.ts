import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationsQueryKey } from "@/features/organizations/hooks/use-organizations";
import { resourcesQueryKey } from "@/features/resources/hooks/use-resources";
import {
  createInvitation,
  getTeamInvitations,
  getTeamMembers,
  leaveOrganization,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "../api/team-api";
import type { CreateInvitationInput, UpdateMemberRoleInput } from "../types";

export const teamKeys = {
  all: ["team"] as const,
  organization: (organizationId: string) =>
    [...teamKeys.all, organizationId] as const,
  members: (organizationId: string) =>
    [...teamKeys.organization(organizationId), "members"] as const,
  invitations: (organizationId: string) =>
    [...teamKeys.organization(organizationId), "invitations"] as const,
};

export function useTeamMembers(organizationId: string) {
  return useQuery({
    queryKey: teamKeys.members(organizationId),
    queryFn: ({ signal }) => getTeamMembers(organizationId, signal),
    enabled: Boolean(organizationId),
  });
}

export function useTeamInvitations(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: teamKeys.invitations(organizationId),
    queryFn: ({ signal }) => getTeamInvitations(organizationId, signal),
    enabled: Boolean(organizationId) && (options.enabled ?? true),
  });
}

export function useInviteMember(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateInvitationInput) =>
      createInvitation(organizationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teamKeys.invitations(organizationId),
      });
    },
  });
}

export function useRevokeInvitation(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) =>
      revokeInvitation(organizationId, invitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teamKeys.invitations(organizationId),
      });
    },
  });
}

export function useUpdateMemberRole(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMemberRoleInput) =>
      updateMemberRole(organizationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teamKeys.members(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: organizationsQueryKey,
      });
    },
  });
}

export function useRemoveMember(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (membershipId: string) =>
      removeMember(organizationId, membershipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teamKeys.members(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: resourcesQueryKey(organizationId),
      });
    },
  });
}

export function useLeaveOrganization(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => leaveOrganization(organizationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: organizationsQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: teamKeys.organization(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: resourcesQueryKey(organizationId),
      });
    },
  });
}
