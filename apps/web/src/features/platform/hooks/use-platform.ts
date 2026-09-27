import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { organizationsQueryKey } from "@/features/organizations/hooks/use-organizations";
import {
  approvePlatformRequest,
  getPlatformIdentity,
  getPlatformOrganizations,
  getPlatformRequest,
  getPlatformRequests,
  rejectPlatformRequest,
} from "../api/platform-api";
import type { RequestStatus } from "../types";

export const platformIdentityQueryKey = ["platform", "me"] as const;
export const platformRequestsQueryKey = ["platform", "requests"] as const;
export const platformOrganizationsQueryKey = [
  "platform",
  "organizations",
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

export function usePlatformOrganizations() {
  return useInfiniteQuery({
    queryKey: platformOrganizationsQueryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getPlatformOrganizations(pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
