import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply } from "fastify";
import { sendOrganizationWriteStateError } from "../../organizations/http/errors.js";
import { listServiceResources } from "../application/queries.js";
import {
  assignResourceToService,
  type ResourceServiceAssignmentResult,
  unassignResourceFromService,
} from "../application/resource-assignment.js";
import { serviceParams, serviceResourceParams } from "./schemas.js";

function sendAssignmentError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<ResourceServiceAssignmentResult, { ok: false }>["reason"],
) {
  if (
    reason === "organization_archived" ||
    reason === "organization_suspended"
  ) {
    return sendOrganizationWriteStateError(reply, requestId, reason);
  }
  const errors = {
    organization_not_found: [
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    ],
    service_not_found: [404, "SERVICE_NOT_FOUND", "Service not found"],
    resource_not_found: [404, "RESOURCE_NOT_FOUND", "Resource not found"],
    insufficient_role: [
      403,
      "SERVICE_MANAGEMENT_NOT_ALLOWED",
      "Your organization role does not allow Service management",
    ],
    service_inactive: [409, "SERVICE_INACTIVE", "The Service is deactivated"],
    resource_inactive: [
      409,
      "RESOURCE_INACTIVE",
      "The Resource is deactivated",
    ],
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

export const assignmentRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    "/api/organizations/:organizationId/services/:serviceId/resources",
    { schema: { params: serviceParams } },
    async (request, reply) => {
      const result = await listServiceResources({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAssignmentError(reply, request.id, result.reason);
      return reply.code(200).send({ items: result.items });
    },
  );

  app.put(
    "/api/organizations/:organizationId/services/:serviceId/resources/:resourceId",
    { schema: { params: serviceResourceParams } },
    async (request, reply) => {
      const result = await assignResourceToService({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAssignmentError(reply, request.id, result.reason);
      return reply.code(200).send(result.assignment);
    },
  );

  app.delete(
    "/api/organizations/:organizationId/services/:serviceId/resources/:resourceId",
    { schema: { params: serviceResourceParams } },
    async (request, reply) => {
      const result = await unassignResourceFromService({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAssignmentError(reply, request.id, result.reason);
      return reply.code(200).send(result.assignment);
    },
  );
};
