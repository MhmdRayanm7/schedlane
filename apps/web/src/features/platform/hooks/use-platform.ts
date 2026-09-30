import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { organizationsQueryKey } from "@/features/organizations/hooks/use-organizations";
import type { PublicationRequestStatus } from "@/features/publication/types";
import {
  approvePlatformRequest,
  createPlatformOrganization,
  getPlatformIdentity,
  getPlatformOrganizations,
  getPlatformPublicationRequest,
  getPlatformPublicationRequests,
  getPlatformRequest,
  getPlatformRequests,
  publishPlatformPublicationRequest,
  rejectPlatformPublicationRequest,
  rejectPlatformRequest,
  suspendPlatformOrganization,
  unpublishPlatformOrganization,
  unsuspendPlatformOrganization,
} from "../api/platform-api";
import type {
  CreatePlatformOrganizationInput,
  PlatformOrganizationLifecycle,
  RequestStatus,
} from "../types";

export const platformIdentityQueryKey = ["platform", "me"] as const;
export const platformRequestsQueryKey = ["platform", "requests"] as const;
export const platformOrganizationsQueryKey = [
  "platform",
  "organizations",
] as const;
export const platformPublicationsQueryKey = [
  "platform",
  "publications",
] as const;

export function usePlatformIdentity() {
  return useQuery({
    queryKey: platformIdentityQueryKey,
    queryFn: ({ signal }) => getPlatformIdentity(signal),
    retry: false,
  });
}

export function usePlatformRequests(status: RequestStatus) {
  return useInfiniteQuery({
    queryKey: [...platformRequestsQueryKey, status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getPlatformRequests(status, pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function usePlatformRequest(id: string | null) {
  return useQuery({
    queryKey: [...platformRequestsQueryKey, "detail", id],
    queryFn: ({ signal }) => getPlatformRequest(id as string, signal),
    enabled: Boolean(id),
  });
}

export function usePlatformDecision() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: platformRequestsQueryKey }),
      queryClient.invalidateQueries({
        queryKey: platformOrganizationsQueryKey,
      }),
      queryClient.invalidateQueries({ queryKey: organizationsQueryKey }),
    ]);
  };
  const approve = useMutation({
    mutationFn: ({ id, slug }: { id: string; slug: string }) =>
      approvePlatformRequest(id, slug),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectPlatformRequest(id, reason),
    onSuccess: invalidate,
  });
  return { approve, reject };
}

export function usePlatformOrganizations(
  lifecycle: PlatformOrganizationLifecycle = "active",
  search = "",
) {
  return useInfiniteQuery({
    queryKey: [...platformOrganizationsQueryKey, { lifecycle, search }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getPlatformOrganizations(lifecycle, search, pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

function useInvalidateOrganizationDirectories() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: platformOrganizationsQueryKey,
      }),
      queryClient.invalidateQueries({ queryKey: organizationsQueryKey }),
    ]);
  };
}

export function useCreatePlatformOrganization() {
  const invalidate = useInvalidateOrganizationDirectories();
  return useMutation({
    mutationFn: (input: CreatePlatformOrganizationInput) =>
      createPlatformOrganization(input),
    onSuccess: invalidate,
  });
}

export function useSuspendOrganization() {
  const invalidate = useInvalidateOrganizationDirectories();
  return useMutation({
    mutationFn: ({
      organizationId,
      reason,
    }: {
      organizationId: string;
      reason: string;
    }) => suspendPlatformOrganization(organizationId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useUnsuspendOrganization() {
  const invalidate = useInvalidateOrganizationDirectories();
  return useMutation({
    mutationFn: ({
      organizationId,
      internalNote,
    }: {
      organizationId: string;
      internalNote?: string;
    }) => unsuspendPlatformOrganization(organizationId, internalNote),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function usePlatformPublications(status: PublicationRequestStatus) {
  return useQuery({
    queryKey: [...platformPublicationsQueryKey, status],
    queryFn: ({ signal }) => getPlatformPublicationRequests(status, signal),
  });
}

export function usePlatformPublication(id: string | null) {
  return useQuery({
    queryKey: [...platformPublicationsQueryKey, "detail", id],
    queryFn: ({ signal }) =>
      getPlatformPublicationRequest(id as string, signal),
    enabled: Boolean(id),
  });
}

export function usePlatformPublicationDecision() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: platformPublicationsQueryKey }),
      queryClient.invalidateQueries({
        queryKey: platformOrganizationsQueryKey,
      }),
      queryClient.invalidateQueries({ queryKey: organizationsQueryKey }),
    ]);
  };
  const publish = useMutation({
    mutationFn: (id: string) => publishPlatformPublicationRequest(id),
    onSuccess: invalidate,
    onError: invalidate,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectPlatformPublicationRequest(id, reason),
    onSuccess: invalidate,
  });
  return { publish, reject };
}

export function useUnpublishOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      reason,
    }: {
      organizationId: string;
      reason: string;
    }) => unpublishPlatformOrganization(organizationId, reason),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: platformOrganizationsQueryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: platformPublicationsQueryKey,
        }),
        queryClient.invalidateQueries({ queryKey: organizationsQueryKey }),
      ]);
    },
  });
}
