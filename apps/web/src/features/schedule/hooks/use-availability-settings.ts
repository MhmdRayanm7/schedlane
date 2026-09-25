import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAvailabilitySettings,
  updateAvailabilitySettings,
} from "../api/schedule-api";
import type { UpdateAvailabilitySettingsInput } from "../types";

export function availabilitySettingsQueryKey(organizationId: string) {
  return ["organizations", organizationId, "availability", "settings"] as const;
}

export function useAvailabilitySettings(organizationId: string) {
  return useQuery({
    queryKey: availabilitySettingsQueryKey(organizationId),
    queryFn: ({ signal }) => getAvailabilitySettings(organizationId, signal),
    enabled: Boolean(organizationId),
  });
}

export function useUpdateAvailabilitySettings(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAvailabilitySettingsInput) =>
      updateAvailabilitySettings(organizationId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: availabilitySettingsQueryKey(organizationId),
      });
    },
  });
}
