import type { MembershipRole } from "../../../db-types.js";

export function canManageResourceAvailability(
  actor: { user_id: string; role: MembershipRole },
  linkedUserId: string | null,
  memberships: { user_id: string; role: MembershipRole }[],
): boolean {
  if (actor.role === "owner") return true;
  if (actor.role === "staff") return linkedUserId === actor.user_id;
  return (
    linkedUserId === null ||
    memberships.find((member) => member.user_id === linkedUserId)?.role ===
      "staff"
  );
}
