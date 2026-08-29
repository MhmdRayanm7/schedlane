import { db } from "../../db.js";

type CreateOrganizationRequestInput = {
  requestedByUserId: string;
  name: string;
};

export async function createOrganizationRequest(
  input: CreateOrganizationRequestInput,
) {
  const name = input.name.trim();

  const request = await db
    .insertInto("organization_request")
    .values({
      requested_by_user_id: input.requestedByUserId,
      name,
    })
    .returning(["id", "name", "status", "created_at"])
    .executeTakeFirstOrThrow();

  return {
    id: request.id,
    name: request.name,
    status: request.status,
    createdAt: request.created_at.toISOString(),
  };
}
