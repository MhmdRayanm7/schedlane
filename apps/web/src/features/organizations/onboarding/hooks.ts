import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationsQueryKey } from "../hooks/use-organizations";
import { getMyOrganizationRequest, submitOrganizationRequest } from "./api";

export const organizationRequestQueryKey = [
  "organization-request",
  "me",
] as const;

export function useMyOrganizationRequest() {
  return useQuery({
    queryKey: organizationRequestQueryKey,
    queryFn: ({ signal }) => getMyOrganizationRequest(signal),
    refetchInterval: (query) =>
      query.state.data?.request?.status === "pending" ? 30_000 : false,
  });
}

export function useSubmitOrganizationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitOrganizationRequest,
    onSuccess: async (request) => {
      queryClient.setQueryData(organizationRequestQueryKey, { request });
      await queryClient.invalidateQueries({ queryKey: organizationsQueryKey });
    },
  });
}
