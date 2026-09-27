import { apiClient } from "@/shared/api/client";
import type { OrganizationRequest, OrganizationRequestInput } from "./types";

export function getMyOrganizationRequest(signal?: AbortSignal) {
  return apiClient<{ request: OrganizationRequest | null }>(
    "/api/organization-requests/me",
    { signal },
  );
}

export function submitOrganizationRequest(input: OrganizationRequestInput) {
  return apiClient<
    Omit<
      OrganizationRequest,
      "organizationId" | "rejectionReason" | "decidedAt"
    >
  >("/api/organization-requests", {
    method: "POST",
    body: input,
  }).then((request) => ({
    ...request,
    organizationId: null,
    rejectionReason: null,
    decidedAt: null,
  }));
}
