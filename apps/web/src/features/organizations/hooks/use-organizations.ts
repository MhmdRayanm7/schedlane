import { useQuery } from "@tanstack/react-query";
import { getOrganizations } from "../api/get-organizations";

export const organizationsQueryKey = ["organizations"] as const;

export function useOrganizations() {
  return useQuery({
    queryFn: ({ signal }) => getOrganizations(signal),
    queryKey: organizationsQueryKey,
  });
}
