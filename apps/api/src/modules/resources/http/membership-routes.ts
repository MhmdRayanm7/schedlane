import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sendOrganizationWriteStateError } from "../../organizations/http/errors.js";
import { getResourceLinkCandidates } from "../application/link-candidates.js";
import {
  linkResourceToMember,
  unlinkResource,
} from "../application/membership.js";
import { linkResourceBody, resourceParams } from "./schemas.js";

export const membershipRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    "/api/organizations/:organizationId/resources/:resourceId/link-candidates",
    {
      schema: {
        params: resourceParams,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await getResourceLinkCandidates({
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
                "Your organization role does not allow this Resource link",
              requestId: request.id,
            });

          case "resource_deactivated":
            return reply.code(409).send({
              code: "RESOURCE_DEACTIVATED",
              message: "The Resource is deactivated",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send(result.data);
    },
  );

  app.put(
    "/api/organizations/:organizationId/resources/:resourceId/link",
    {
      schema: {
        params: resourceParams,
        body: linkResourceBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await linkResourceToMember({
        userId: user.id,
        organizationId: request.params.organizationId,
        resourceId: request.params.resourceId,
        membershipId: request.body.membershipId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "member_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_MEMBER_NOT_FOUND",
              message: "Organization member not found",
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
                "Your organization role does not allow this Resource link",
              requestId: request.id,
            });

          case "resource_deactivated":
            return reply.code(409).send({
              code: "RESOURCE_DEACTIVATED",
              message: "The Resource is deactivated",
              requestId: request.id,
            });

          case "resource_already_linked":
            return reply.code(409).send({
              code: "RESOURCE_ALREADY_LINKED",
              message: "The Resource is already linked to another member",
              requestId: request.id,
            });

          case "member_resource_already_linked":
            return reply.code(409).send({
              code: "MEMBER_RESOURCE_ALREADY_LINKED",
              message:
                "The organization member is already linked to another Resource",
              requestId: request.id,
            });

          case "resource_invitation_pending":
            return reply.code(409).send({
              code: "RESOURCE_INVITATION_PENDING",
              message:
                "Revoke the active Staff invitation before linking this Resource",
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

  app.delete(
    "/api/organizations/:organizationId/resources/:resourceId/link",
    {
      schema: {
        params: resourceParams,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await unlinkResource({
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
                "Your organization role does not allow this Resource unlink",
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

      return reply.code(204).send();
    },
  );
};
