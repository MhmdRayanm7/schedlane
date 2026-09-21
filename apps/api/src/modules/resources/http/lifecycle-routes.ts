import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sendOrganizationWriteStateError } from "../../organizations/http/errors.js";
import {
  deactivateResource,
  reactivateResource,
} from "../application/lifecycle.js";
import { resourceParams } from "./schemas.js";

export const lifecycleRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    "/api/organizations/:organizationId/resources/:resourceId/deactivate",
    {
      schema: {
        params: resourceParams,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await deactivateResource({
        userId: user.id,
        organizationId: request.params.organizationId,
        resourceId: request.params.resourceId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "resource_not_found":
            return reply.code(404).send({
              code: "RESOURCE_NOT_FOUND",
              message: "Resource not found",
              requestId: request.id,
            });

          case "insufficient_role":
            return reply.code(403).send({
              code: "RESOURCE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow this Resource deactivation",
              requestId: request.id,
            });

          case "organization_archived":
          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(200).send(result.resource);
    },
  );

  app.post(
    "/api/organizations/:organizationId/resources/:resourceId/reactivate",
    {
      schema: {
        params: resourceParams,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await reactivateResource({
        userId: user.id,
        organizationId: request.params.organizationId,
        resourceId: request.params.resourceId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "resource_not_found":
            return reply.code(404).send({
              code: "RESOURCE_NOT_FOUND",
              message: "Resource not found",
              requestId: request.id,
            });

          case "insufficient_role":
            return reply.code(403).send({
              code: "RESOURCE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow this Resource reactivation",
              requestId: request.id,
            });

          case "organization_archived":
          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(200).send(result.resource);
    },
  );
};
