import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/api-error";
import {
  createResourceTimeBlock,
  deleteResourceTimeBlock,
  getOrganizationDateOverride,
  getResourceDateOverride,
  getResourceTimeBlocks,
  updateOrganizationDateOverride,
  updateResourceDateOverride,
} from "../api/schedule-api";
import type { AvailabilityMode, MinuteInterval } from "../types";

export function orgDateOverrideQueryKey(organizationId: string, date: string) {
  return [
    "organizations",
    organizationId,
    "availability",
    "date-override",
    date,
  ] as const;
}

export function resourceDateOverrideQueryKey(
  organizationId: string,
  resourceId: string,
  date: string,
) {
  return [
    "organizations",
    organizationId,
    "resources",
    resourceId,
    "availability",
    "date-override",
    date,
  ] as const;
}

export function resourceTimeBlocksQueryKey(
  organizationId: string,
  resourceId: string,
  date: string,
) {
  return [
    "organizations",
    organizationId,
    "resources",
    resourceId,
    "availability",
    "time-blocks",
    date,
  ] as const;
}

export function useOrganizationDateOverride(
  organizationId: string,
  date: string,
) {
  return useQuery({
    queryKey: orgDateOverrideQueryKey(organizationId, date),
    queryFn: ({ signal }) =>
      getOrganizationDateOverride(organizationId, date, signal),
    enabled: Boolean(organizationId && date),
  });
}

export function useUpdateOrganizationDateOverride(
  organizationId: string,
  date: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      mode: AvailabilityMode;
      intervals: MinuteInterval[];
    }) => updateOrganizationDateOverride(organizationId, date, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orgDateOverrideQueryKey(organizationId, date),
      });
    },
  });
}

export function useResourceDateOverride(
  organizationId: string,
  resourceId: string,
  date: string,
  enabled = true,
) {
  return useQuery({
    queryKey: resourceDateOverrideQueryKey(organizationId, resourceId, date),
    queryFn: ({ signal }) =>
      getResourceDateOverride(organizationId, resourceId, date, signal),
    enabled: Boolean(organizationId && resourceId && date && enabled),
  });
}

export function useUpdateResourceDateOverride(
  organizationId: string,
  resourceId: string,
  date: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      mode: AvailabilityMode;
      intervals: MinuteInterval[];
    }) => updateResourceDateOverride(organizationId, resourceId, date, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: resourceDateOverrideQueryKey(
          organizationId,
          resourceId,
          date,
        ),
      });
    },
  });
}

export function useResourceTimeBlocks(
  organizationId: string,
  resourceId: string,
  date: string,
  enabled = true,
) {
  return useQuery({
    queryKey: resourceTimeBlocksQueryKey(organizationId, resourceId, date),
    queryFn: ({ signal }) =>
      getResourceTimeBlocks(organizationId, resourceId, date, signal),
    enabled: Boolean(organizationId && resourceId && date && enabled),
  });
}

export function useCreateResourceTimeBlock(
  organizationId: string,
  resourceId: string,
  date: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (interval: MinuteInterval) =>
      createResourceTimeBlock(organizationId, resourceId, date, interval),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: resourceTimeBlocksQueryKey(organizationId, resourceId, date),
      });
    },
  });
}

export function useDeleteResourceTimeBlock(
  organizationId: string,
  resourceId: string,
  date: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (timeBlockId: string) =>
      deleteResourceTimeBlock(organizationId, resourceId, timeBlockId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: resourceTimeBlocksQueryKey(organizationId, resourceId, date),
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "TIME_BLOCK_NOT_FOUND") {
        queryClient.invalidateQueries({
          queryKey: resourceTimeBlocksQueryKey(
            organizationId,
            resourceId,
            date,
          ),
        });
      }
    },
  });
}
