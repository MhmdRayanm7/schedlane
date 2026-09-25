import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getManageableScheduleResources,
  getOrganizationWeeklyHours,
  getResourceWeeklyHours,
  updateOrganizationWeeklyHours,
  updateResourceWeeklyHours,
} from "../api/schedule-api";
import type { ResourceWeekdayHours, WeekdayHours } from "../types";

export function manageableResourcesQueryKey(organizationId: string) {
  return [
    "organizations",
    organizationId,
    "availability",
    "resources",
  ] as const;
}

export function orgWeeklyHoursQueryKey(organizationId: string) {
  return [
    "organizations",
    organizationId,
    "availability",
    "weekly-hours",
  ] as const;
}

export function resourceWeeklyHoursQueryKey(
  organizationId: string,
  resourceId: string,
) {
  return [
    "organizations",
    organizationId,
    "resources",
    resourceId,
    "availability",
    "weekly-hours",
  ] as const;
}

export function useManageableScheduleResources(organizationId: string) {
  return useQuery({
    queryKey: manageableResourcesQueryKey(organizationId),
    queryFn: ({ signal }) =>
      getManageableScheduleResources(organizationId, signal),
    enabled: Boolean(organizationId),
  });
}

export function useOrganizationWeeklyHours(organizationId: string) {
  return useQuery({
    queryKey: orgWeeklyHoursQueryKey(organizationId),
    queryFn: ({ signal }) => getOrganizationWeeklyHours(organizationId, signal),
    enabled: Boolean(organizationId),
  });
}

export function useUpdateOrganizationWeeklyHours(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days: WeekdayHours[]) =>
      updateOrganizationWeeklyHours(organizationId, days),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orgWeeklyHoursQueryKey(organizationId),
      });
    },
  });
}

export function useResourceWeeklyHours(
  organizationId: string,
  resourceId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: resourceWeeklyHoursQueryKey(organizationId, resourceId),
    queryFn: ({ signal }) =>
      getResourceWeeklyHours(organizationId, resourceId, signal),
    enabled: Boolean(organizationId && resourceId && enabled),
  });
}

export function useUpdateResourceWeeklyHours(
  organizationId: string,
  resourceId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days: ResourceWeekdayHours[]) =>
      updateResourceWeeklyHours(organizationId, resourceId, days),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: resourceWeeklyHoursQueryKey(organizationId, resourceId),
      });
    },
  });
}
