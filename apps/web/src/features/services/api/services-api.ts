import { apiClient } from "@/shared/api/client";
import type {
  CreateServiceInput,
  Service,
  ServicesResponse,
  UpdateServiceInput,
} from "../types";

export function getServices(
  organizationId: string,
  signal?: AbortSignal,
): Promise<ServicesResponse> {
  return apiClient<ServicesResponse>(
    `/api/organizations/${organizationId}/services`,
    { signal },
  );
}

export function createService(
  organizationId: string,
  input: CreateServiceInput,
): Promise<Service> {
  return apiClient<Service>(`/api/organizations/${organizationId}/services`, {
    method: "POST",
    body: input,
  });
}

export function updateService(
  organizationId: string,
  serviceId: string,
  input: UpdateServiceInput,
): Promise<Service> {
  return apiClient<Service>(
    `/api/organizations/${organizationId}/services/${serviceId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export function deactivateService(
  organizationId: string,
  serviceId: string,
): Promise<Service> {
  return apiClient<Service>(
    `/api/organizations/${organizationId}/services/${serviceId}/deactivate`,
    {
      method: "POST",
    },
  );
}

export function reactivateService(
  organizationId: string,
  serviceId: string,
): Promise<Service> {
  return apiClient<Service>(
    `/api/organizations/${organizationId}/services/${serviceId}/reactivate`,
    {
      method: "POST",
    },
  );
}

export function getServiceResources(
  organizationId: string,
  serviceId: string,
  signal?: AbortSignal,
): Promise<import("../types").ServiceResourcesResponse> {
  return apiClient<import("../types").ServiceResourcesResponse>(
    `/api/organizations/${organizationId}/services/${serviceId}/resources`,
    { signal },
  );
}

export function assignResourceToService(
  organizationId: string,
  serviceId: string,
  resourceId: string,
): Promise<{ serviceId: string; resourceId: string; assigned: boolean }> {
  return apiClient(
    `/api/organizations/${organizationId}/services/${serviceId}/resources/${resourceId}`,
    {
      method: "PUT",
    },
  );
}

export function unassignResourceFromService(
  organizationId: string,
  serviceId: string,
  resourceId: string,
): Promise<{ serviceId: string; resourceId: string; assigned: boolean }> {
  return apiClient(
    `/api/organizations/${organizationId}/services/${serviceId}/resources/${resourceId}`,
    {
      method: "DELETE",
    },
  );
}
