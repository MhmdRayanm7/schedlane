import type { MembershipRole } from "../../db-types.js";

export function canCreateManualBookingForResource(
  actor: { userId: string; role: MembershipRole },
  resourceUserId: string | null,
): boolean {
  if (actor.role === "owner" || actor.role === "manager") return true;
  return resourceUserId === actor.userId;
}
