import { apiClient } from "@/shared/api/client";
import type {
  CursorPage,
  PlatformIdentity,
  PlatformOrganization,
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
  cursor?: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ limit: "30" });
  if (cursor) query.set("cursor", cursor);
  return apiClient<CursorPage<PlatformOrganization>>(
    `/api/platform/organizations?${query}`,
    { signal },
  );
}
