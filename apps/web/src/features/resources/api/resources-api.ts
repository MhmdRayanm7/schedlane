import { apiClient } from "@/shared/api/client";
import type {
  CreateResourceInput,
  Resource,
  ResourceLinkCandidates,
  ResourcesResponse,
} from "../types";

export function getResources(
  organizationId: string,
  signal?: AbortSignal,
): Promise<ResourcesResponse> {
  return apiClient<ResourcesResponse>(
    `/api/organizations/${organizationId}/resources`,
    { signal },
  );
}

export function createResource(
  organizationId: string,
  input: CreateResourceInput,
): Promise<Resource> {
  return apiClient<Resource>(`/api/organizations/${organizationId}/resources`, {
    method: "POST",
    body: input,
  });
}

export function deactivateResource(
  organizationId: string,
  resourceId: string,
): Promise<Resource> {
  return apiClient<Resource>(
    `/api/organizations/${organizationId}/resources/${resourceId}/deactivate`,
    {
      method: "POST",
    },
  );
}

export function reactivateResource(
  organizationId: string,
  resourceId: string,
): Promise<Resource> {
  return apiClient<Resource>(
    `/api/organizations/${organizationId}/resources/${resourceId}/reactivate`,
    {
      method: "POST",
    },
  );
}

export function getResourceLinkCandidates(
  organizationId: string,
  resourceId: string,
  signal?: AbortSignal,
): Promise<ResourceLinkCandidates> {
  return apiClient<ResourceLinkCandidates>(
    `/api/organizations/${organizationId}/resources/${resourceId}/link-candidates`,
    { signal },
  );
}

export function linkResourceToMember(
  organizationId: string,
  resourceId: string,
  membershipId: string,
): Promise<{ id: string; linkedMembershipId: string }> {
  return apiClient<{ id: string; linkedMembershipId: string }>(
    `/api/organizations/${organizationId}/resources/${resourceId}/link`,
    {
      method: "PUT",
      body: { membershipId },
    },
  );
}

export function unlinkResourceFromMember(
  organizationId: string,
  resourceId: string,
): Promise<void> {
  return apiClient<void>(
    `/api/organizations/${organizationId}/resources/${resourceId}/link`,
    {
      method: "DELETE",
    },
  );
}
