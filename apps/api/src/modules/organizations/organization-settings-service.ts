import { db } from "../../db.js";
import type { StaffTeamVisibility } from "../../db-types.js";
import {
  type OrganizationWriteStateFailure,
  requireWritableOrganization,
} from "./organization-write-policy.js";

type UpdateStaffTeamVisibilityInput = {
  userId: string;
  organizationId: string;
  visibility: StaffTeamVisibility;
};

type UpdateStaffTeamVisibilityFailure =
  | "organization_not_found"
  | "owner_required"
  | OrganizationWriteStateFailure;

export type UpdateStaffTeamVisibilityResult =
  | {
      ok: true;
      staffTeamVisibility: StaffTeamVisibility;
    }
  | {
      ok: false;
      reason: UpdateStaffTeamVisibilityFailure;
    };

export async function updateStaffTeamVisibility(
  input: UpdateStaffTeamVisibilityInput,
): Promise<UpdateStaffTeamVisibilityResult> {
  return db.transaction().execute(async (trx) => {
    // Lock membership so the permission cannot change during the update.
    const membership = await trx
      .selectFrom("membership")
      .select("role")
      .where("user_id", "=", input.userId)
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();

    if (!membership) {
      return {
        ok: false,
        reason: "organization_not_found",
      };
    }

    if (membership.role !== "owner") {
      return {
        ok: false,
        reason: "owner_required",
      };
    }

    const writeState = await requireWritableOrganization(
      trx,
      input.organizationId,
    );

    if (!writeState.ok) {
      return writeState;
    }

    await trx
      .updateTable("organization")
      .set({
        staff_team_visibility: input.visibility,
        updated_at: new Date(),
      })
      .where("id", "=", input.organizationId)
      .executeTakeFirstOrThrow();

    return {
      ok: true,
      staffTeamVisibility: input.visibility,
    };
  });
}
