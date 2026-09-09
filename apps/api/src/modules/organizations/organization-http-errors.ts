import type { FastifyReply } from "fastify";
import type { OrganizationWriteStateFailure } from "./organization-write-policy.js";

export function sendOrganizationWriteStateError(
  reply: FastifyReply,
  requestId: string,
  reason: OrganizationWriteStateFailure,
) {
  switch (reason) {
    case "organization_archived":
      return reply.code(409).send({
        code: "ORGANIZATION_ARCHIVED",
        message: "Restore the organization before making changes",
        requestId,
      });

    case "organization_suspended":
      return reply.code(409).send({
        code: "ORGANIZATION_SUSPENDED",
        message: "The organization is suspended and read-only",
        requestId,
      });
  }
}
