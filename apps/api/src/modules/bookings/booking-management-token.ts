import { createHash, randomBytes } from "node:crypto";

const GUEST_MANAGEMENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateGuestManagementToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGuestManagementToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isGuestManagementToken(token: string): boolean {
  return GUEST_MANAGEMENT_TOKEN_PATTERN.test(token);
}
