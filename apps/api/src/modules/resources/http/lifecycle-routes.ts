import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sendOrganizationWriteStateError } from "../../organizations/http/errors.js";
import { deleteResource } from "../application/delete.js";
import {
  deactivateResource,
  reactivateResource,
} from "../application/lifecycle.js";
import { resourceParams } from "./schemas.js";

export const lifecycleRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.delete(
    "/api/organizations/:organizationId/resources/:resourceId",
    { schema: { params: resourceParams } },
    async (request, reply) => {
      const result = await deleteResource({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok) {
        const common = { requestId: request.id };
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              ...common,
            });
          case "resource_not_found":
            return reply.code(404).send({
              code: "RESOURCE_NOT_FOUND",
              message: "Resource not found",
              ...common,
            });
          case "insufficient_role":
            return reply.code(403).send({
              code: "RESOURCE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow Resource management",
              ...common,
            });
          case "resource_must_be_inactive":
            return reply.code(409).send({
              code: "RESOURCE_MUST_BE_INACTIVE",
              message:
                "Deactivate this resource before deleting it permanently",
              ...common,
            });
          case "resource_has_booking_history":
            return reply.code(409).send({
              code: "RESOURCE_HAS_BOOKING_HISTORY",
              message:
                "This resource has booking history and can't be permanently deleted. Keep it inactive instead.",
              ...common,
            });
          case "resource_linked_to_member":
            return reply.code(409).send({
              code: "RESOURCE_LINKED_TO_MEMBER",
              message:
                "Unlink this resource from its team member before deleting it permanently.",
              ...common,
            });
          case "resource_has_invitation_history":
            return reply.code(409).send({
              code: "RESOURCE_HAS_INVITATION_HISTORY",
              message:
                "This resource is referenced by team invitation history and can't be permanently deleted. Keep it inactive instead.",
              ...common,
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
      return reply.code(204).send();
    },
  );

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
