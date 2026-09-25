import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createResource,
  deactivateResource,
  getResourceLinkCandidates,
  getResources,
  linkResourceToMember,
  reactivateResource,
  unlinkResourceFromMember,
} from "../api/resources-api";
import type { CreateResourceInput } from "../types";

export function resourcesQueryKey(organizationId: string) {
  return ["organizations", organizationId, "resources"] as const;
}

export function resourceLinkCandidatesQueryKey(
  organizationId: string,
  resourceId: string,
) {
  return [
    "organizations",
    organizationId,
    "resources",
    resourceId,
    "link-candidates",
  ] as const;
}

export function useResources(organizationId: string) {
  return useQuery({
    queryKey: resourcesQueryKey(organizationId),
    queryFn: ({ signal }) => getResources(organizationId, signal),
    enabled: Boolean(organizationId),
  });
}

export function useCreateResource(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateResourceInput) =>
      createResource(organizationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: resourcesQueryKey(organizationId),
      });
    },
  });
}

export function useDeactivateResource(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resourceId: string) =>
      deactivateResource(organizationId, resourceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: resourcesQueryKey(organizationId),
      });
    },
  });
}

export function useReactivateResource(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resourceId: string) =>
      reactivateResource(organizationId, resourceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: resourcesQueryKey(organizationId),
      });
    },
  });
}

export function useResourceLinkCandidates(
  organizationId: string,
  resourceId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: resourceLinkCandidatesQueryKey(organizationId, resourceId),
    queryFn: ({ signal }) =>
      getResourceLinkCandidates(organizationId, resourceId, signal),
    enabled: Boolean(organizationId && resourceId && enabled),
  });
}

export function useLinkResource(organizationId: string, resourceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (membershipId: string) =>
      linkResourceToMember(organizationId, resourceId, membershipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: resourcesQueryKey(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: resourceLinkCandidatesQueryKey(organizationId, resourceId),
      });
    },
  });
}

export function useUnlinkResource(organizationId: string, resourceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => unlinkResourceFromMember(organizationId, resourceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: resourcesQueryKey(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: resourceLinkCandidatesQueryKey(organizationId, resourceId),
      });
    },
  });
}
