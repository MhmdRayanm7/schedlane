import { ApiError } from "@/shared/api/api-error";

export function settingsActionError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;

  switch (error.code) {
    case "ORGANIZATION_ARCHIVED":
      return "This organization is archived and cannot be modified.";
    case "ORGANIZATION_SUSPENDED":
      return "This organization is suspended and cannot be modified.";
    case "ORGANIZATION_OWNER_REQUIRED":
      return "Only an organization owner can perform this action.";
    case "INSUFFICIENT_ORGANIZATION_ROLE":
      return "Your organization role does not allow this action.";
    default:
      return fallback;
  }
}
