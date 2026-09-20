import { isGuestManagementToken } from "./booking-management-token.js";

const BEARER_CREDENTIAL_PATTERN = /^Bearer ([A-Za-z0-9_-]{43})$/i;

export function parseGuestManagementBearer(
  authorization: string | undefined,
): string | null {
  if (authorization === undefined) return null;
  const match = BEARER_CREDENTIAL_PATTERN.exec(authorization);
  if (!match?.[1] || !isGuestManagementToken(match[1])) return null;
  return match[1];
}
