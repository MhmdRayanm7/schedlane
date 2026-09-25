import { apiClient } from "@/shared/api/client";
import type {
  AvailabilitySettings,
  DateOverride,
  ManageableResourcesResponse,
  MinuteInterval,
  ResourceTimeBlocksResponse,
  ResourceWeekdayHours,
  ResourceWeeklyHoursResponse,
  TimeBlockItem,
  UpdateAvailabilitySettingsInput,
  WeekdayHours,
  WeeklyHoursResponse,
} from "../types";

export function getManageableScheduleResources(
  organizationId: string,
  signal?: AbortSignal,
): Promise<ManageableResourcesResponse> {
  return apiClient<ManageableResourcesResponse>(
    `/api/organizations/${organizationId}/availability/resources`,
    { signal },
  );
}

export function getOrganizationWeeklyHours(
  organizationId: string,
  signal?: AbortSignal,
): Promise<WeeklyHoursResponse> {
  return apiClient<WeeklyHoursResponse>(
    `/api/organizations/${organizationId}/availability/weekly-hours`,
    { signal },
  );
}

export function updateOrganizationWeeklyHours(
  organizationId: string,
  days: WeekdayHours[],
): Promise<WeeklyHoursResponse> {
  return apiClient<WeeklyHoursResponse>(
    `/api/organizations/${organizationId}/availability/weekly-hours`,
    {
      method: "PUT",
      body: { days },
    },
  );
}

export function getResourceWeeklyHours(
  organizationId: string,
  resourceId: string,
  signal?: AbortSignal,
): Promise<ResourceWeeklyHoursResponse> {
  return apiClient<ResourceWeeklyHoursResponse>(
    `/api/organizations/${organizationId}/resources/${resourceId}/availability/weekly-hours`,
    { signal },
  );
}

export function updateResourceWeeklyHours(
  organizationId: string,
  resourceId: string,
  days: ResourceWeekdayHours[],
): Promise<ResourceWeeklyHoursResponse> {
  return apiClient<ResourceWeeklyHoursResponse>(
    `/api/organizations/${organizationId}/resources/${resourceId}/availability/weekly-hours`,
    {
      method: "PUT",
      body: { days },
    },
  );
}

export function getOrganizationDateOverride(
  organizationId: string,
  date: string,
  signal?: AbortSignal,
): Promise<DateOverride> {
  return apiClient<DateOverride>(
    `/api/organizations/${organizationId}/availability/date-overrides/${date}`,
    { signal },
  );
}

export function updateOrganizationDateOverride(
  organizationId: string,
  date: string,
  data: { mode: "inherit" | "closed" | "custom"; intervals: MinuteInterval[] },
): Promise<DateOverride> {
  return apiClient<DateOverride>(
    `/api/organizations/${organizationId}/availability/date-overrides/${date}`,
    {
      method: "PUT",
      body: data,
    },
  );
}

export function getResourceDateOverride(
  organizationId: string,
  resourceId: string,
  date: string,
  signal?: AbortSignal,
): Promise<DateOverride> {
  return apiClient<DateOverride>(
    `/api/organizations/${organizationId}/resources/${resourceId}/availability/date-overrides/${date}`,
    { signal },
  );
}

export function updateResourceDateOverride(
  organizationId: string,
  resourceId: string,
  date: string,
  data: { mode: "inherit" | "closed" | "custom"; intervals: MinuteInterval[] },
): Promise<DateOverride> {
  return apiClient<DateOverride>(
    `/api/organizations/${organizationId}/resources/${resourceId}/availability/date-overrides/${date}`,
    {
      method: "PUT",
      body: data,
    },
  );
}

export function getResourceTimeBlocks(
  organizationId: string,
  resourceId: string,
  date: string,
  signal?: AbortSignal,
): Promise<ResourceTimeBlocksResponse> {
  return apiClient<ResourceTimeBlocksResponse>(
    `/api/organizations/${organizationId}/resources/${resourceId}/availability/time-blocks/${date}`,
    { signal },
  );
}

export function createResourceTimeBlock(
  organizationId: string,
  resourceId: string,
  date: string,
  interval: MinuteInterval,
): Promise<TimeBlockItem & { resourceId: string; date: string }> {
  return apiClient<TimeBlockItem & { resourceId: string; date: string }>(
    `/api/organizations/${organizationId}/resources/${resourceId}/availability/time-blocks/${date}`,
    {
      method: "POST",
      body: interval,
    },
  );
}

export function deleteResourceTimeBlock(
  organizationId: string,
  resourceId: string,
  timeBlockId: string,
): Promise<void> {
  return apiClient<void>(
    `/api/organizations/${organizationId}/resources/${resourceId}/availability/time-blocks/${timeBlockId}`,
    {
      method: "DELETE",
    },
  );
}

export function getAvailabilitySettings(
  organizationId: string,
  signal?: AbortSignal,
): Promise<AvailabilitySettings> {
  return apiClient<AvailabilitySettings>(
    `/api/organizations/${organizationId}/availability/settings`,
    { signal },
  );
}

export function updateAvailabilitySettings(
  organizationId: string,
  input: UpdateAvailabilitySettingsInput,
): Promise<AvailabilitySettings> {
  return apiClient<AvailabilitySettings>(
    `/api/organizations/${organizationId}/availability/settings`,
    {
      method: "PATCH",
      body: input,
    },
  );
}
