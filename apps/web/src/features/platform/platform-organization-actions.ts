import type { PlatformOrganization } from "./types";

export type PlatformOrganizationAction =
  | "review"
  | "unpublish"
  | "suspend"
  | "unsuspend";

export function platformOrganizationActions(
  organization: PlatformOrganization,
): PlatformOrganizationAction[] {
  return [
    ...(organization.pendingPublicationRequestId ? (["review"] as const) : []),
    ...(organization.publishedAt ? (["unpublish"] as const) : []),
    organization.suspendedAt ? "unsuspend" : "suspend",
  ];
}
