import { db } from "../../../db.js";

export async function revokeInvitationAfterDeliveryFailure(
  invitationId: string,
): Promise<void> {
  // Failed delivery must not leave behind an active invitation with an undisclosed token.
  await db
    .updateTable("organization_invitation")
    .set({
      revoked_at: new Date(),
    })
    .where("id", "=", invitationId)
    .where("accepted_at", "is", null)
    .where("revoked_at", "is", null)
    .execute();
}
