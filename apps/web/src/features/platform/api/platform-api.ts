import type { PublicationRequestStatus } from "@/features/publication/types";
import { apiClient } from "@/shared/api/client";
import type {
  CreatePlatformOrganizationInput,
  CursorPage,
  PlatformIdentity,
  PlatformOrganization,
  PlatformOrganizationLifecycle,
  PlatformPublicationRequest,
  PlatformPublicationRequestDetail,
  PlatformRequest,
  PlatformRequestDetail,
  RequestStatus,
} from "../types";

export const getPlatformIdentity = (signal?: AbortSignal) =>
  apiClient<PlatformIdentity>("/api/platform/me", { signal });

export function getPlatformRequests(
  status: RequestStatus,
  cursor?: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ status, limit: "30" });
  if (cursor) query.set("cursor", cursor);
  return apiClient<CursorPage<PlatformRequest>>(
    `/api/platform/organization-requests?${query}`,
    { signal },
  );
}

export const getPlatformRequest = (id: string, signal?: AbortSignal) =>
  apiClient<PlatformRequestDetail>(
    `/api/platform/organization-requests/${id}`,
    { signal },
  );

export const approvePlatformRequest = (id: string, slug: string) =>
  apiClient(`/api/platform/organization-requests/${id}/approve`, {
    method: "POST",
    body: { slug },
  });

export const rejectPlatformRequest = (id: string, reason: string) =>
  apiClient(`/api/platform/organization-requests/${id}/reject`, {
    method: "POST",
    body: { reason },
  });

export function getPlatformOrganizations(
  lifecycle: PlatformOrganizationLifecycle,
  search: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ limit: "30" });
  query.set("lifecycle", lifecycle);
  if (search.trim()) query.set("search", search.trim());
  if (cursor) query.set("cursor", cursor);
  return apiClient<CursorPage<PlatformOrganization>>(
    `/api/platform/organizations?${query}`,
    { signal },
  );
}

export const createPlatformOrganization = (
  input: CreatePlatformOrganizationInput,
) =>
  apiClient<PlatformOrganization>("/api/platform/organizations", {
    method: "POST",
    body: input,
  });

export const suspendPlatformOrganization = (
  organizationId: string,
  reason: string,
) =>
  apiClient<{ id: string; suspendedAt: string }>(
    `/api/platform/organizations/${organizationId}/suspend`,
    { method: "POST", body: { reason } },
  );

export const unsuspendPlatformOrganization = (
  organizationId: string,
  internalNote?: string,
) =>
  apiClient<{ id: string; suspendedAt: null }>(
    `/api/platform/organizations/${organizationId}/unsuspend`,
    {
      method: "POST",
      body: internalNote ? { internalNote } : {},
    },
  );

export function getPlatformPublicationRequests(
  status: PublicationRequestStatus,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ status, limit: "100" });
  return apiClient<{ items: PlatformPublicationRequest[] }>(
    `/api/platform/publication-requests?${query}`,
    { signal },
  );
}

export const getPlatformPublicationRequest = (
  id: string,
  signal?: AbortSignal,
) =>
  apiClient<PlatformPublicationRequestDetail>(
    `/api/platform/publication-requests/${id}`,
    { signal },
  );

export const publishPlatformPublicationRequest = (id: string) =>
  apiClient(`/api/platform/publication-requests/${id}/publish`, {
    method: "POST",
  });

export const rejectPlatformPublicationRequest = (id: string, reason: string) =>
  apiClient(`/api/platform/publication-requests/${id}/reject`, {
    method: "POST",
    body: { reason },
  });

export const unpublishPlatformOrganization = (
  organizationId: string,
  reason: string,
) =>
  apiClient(`/api/platform/organizations/${organizationId}/unpublish`, {
    method: "POST",
    body: { reason },
  });
