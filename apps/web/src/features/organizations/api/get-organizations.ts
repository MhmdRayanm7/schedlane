import { apiClient } from "@/shared/api/client";
import type { OrganizationsResponse } from "../types";

export function getOrganizations(signal?: AbortSignal) {
  return apiClient<OrganizationsResponse>("/api/organizations", { signal });
}
