import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { listOrganizationMembers } from "../organization-member-query-service.js";
import {
  leaveOrganization,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from "../organization-membership-service.js";
import { sendOrganizationWriteStateError } from "./errors.js";
import {
  organizationMembershipParamsSchema,
  organizationParamsSchema,
} from "./schemas.js";

const updateOrganizationMemberRoleBody = Type.Object({
  role: Type.Union([
    Type.Literal("owner"),
    Type.Literal("manager"),
    Type.Literal("staff"),
  ]),
});

export const membershipRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // ---------------------------------------------------------------------------
  // Organization memberships
  // ---------------------------------------------------------------------------

  app.get(
    "/api/organizations/:organizationId/members",
    {
      schema: {
        params: organizationParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await listOrganizationMembers({
        userId: user.id,
        organizationId: request.params.organizationId,
      });

      if (!result.ok) {
        return reply.code(404).send({
          code: "ORGANIZATION_NOT_FOUND",
          message: "Organization not found",
          requestId: request.id,
        });
      }

      return reply.code(200).send({
        items: result.items,
      });
    },
  );

  app.patch(
    "/api/organizations/:organizationId/members/:membershipId/role",
    {
      schema: {
        params: organizationMembershipParamsSchema,
        body: updateOrganizationMemberRoleBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await updateOrganizationMemberRole({
        userId: user.id,
        organizationId: request.params.organizationId,
        membershipId: request.params.membershipId,
        role: request.body.role,
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

          case "owner_required":
            return reply.code(403).send({
              code: "ORGANIZATION_OWNER_REQUIRED",
              message: "Organization owner access required",
              requestId: request.id,
            });

          case "last_owner":
            return reply.code(409).send({
              code: "ORGANIZATION_LAST_OWNER_REQUIRED",
              message: "The organization must keep at least one owner",
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

      return reply.code(200).send(result.membership);
    },
  );

  app.delete(
    "/api/organizations/:organizationId/members/:membershipId",
    {
      schema: {
        params: organizationMembershipParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await removeOrganizationMember({
        userId: user.id,
        organizationId: request.params.organizationId,
        membershipId: request.params.membershipId,
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

          case "insufficient_role":
            return reply.code(403).send({
              code: "ORGANIZATION_MEMBER_REMOVAL_NOT_ALLOWED",
              message: "Your organization role does not allow this action",
              requestId: request.id,
            });

          case "self_removal_requires_leave":
            return reply.code(409).send({
              code: "ORGANIZATION_SELF_REMOVAL_REQUIRES_LEAVE",
              message: "Use the organization leave action to remove yourself",
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

  app.post(
    "/api/organizations/:organizationId/leave",
    {
      schema: {
        params: organizationParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await leaveOrganization({
        userId: user.id,
        organizationId: request.params.organizationId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "last_owner":
            return reply.code(409).send({
              code: "ORGANIZATION_LAST_OWNER_REQUIRED",
              message: "The organization must keep at least one owner",
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
