import { ApiError } from "@/shared/api/api-error";

const messages: Record<string, string> = {
  INVALID_BOOKING_STATUS:
    "This booking changed before the action completed. Its latest status is being loaded.",
  NO_SHOW_TOO_EARLY: "This booking cannot be marked no-show before it starts.",
  BOOKING_CONFLICT:
    "This booking can't be restored because its time now conflicts with another confirmed booking.",
  ORGANIZATION_ARCHIVED:
    "Restore the organization before changing this booking.",
  ORGANIZATION_SUSPENDED:
    "This organization is suspended and currently read-only.",
};

export function bookingActionErrorMessage(error: Error | null) {
  if (error instanceof ApiError)
    return messages[error.code] ?? "Something went wrong. Try again.";
  return error ? "Something went wrong. Try again." : null;
}
