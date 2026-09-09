import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { requireVerifiedUser } from "../../http/auth-guard.js";
import { listOrganizationResources } from "./resource-query-service.js";
import {
  createResource,
  linkResourceToMember,
  unlinkResource,
} from "./resource-service.js";

const organizationParams = Type.Object({
  organizationId: Type.String({
    pattern:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
  }),
});

const resourceParams = Type.Object({
  organizationId: Type.String({
    pattern:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
  }),
  resourceId: Type.String({
    pattern:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
  }),
});

const linkResourceBody = Type.Object({
  membershipId: Type.String({
    pattern:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
  }),
});

const createResourceBody = Type.Object({
  name: Type.String({
    minLength: 1,
    maxLength: 120,
    pattern: ".*\\S.*",
  }),
});

export const resourceRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.decorateRequest("verifiedUser");
  app.addHook("preHandler", requireVerifiedUser);

  app.get(
    "/api/organizations/:organizationId/resources",
    {
      schema: {
        params: organizationParams,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await listOrganizationResources({
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

          case "insufficient_role":
            return reply.code(403).send({
              code: "RESOURCE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow resource management",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send({
        items: result.items,
      });
    },
  );

  app.post(
    "/api/organizations/:organizationId/resources",
    {
      schema: {
        params: organizationParams,
        body: createResourceBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await createResource({
        userId: user.id,
        organizationId: request.params.organizationId,
        name: request.body.name,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "insufficient_role":
            return reply.code(403).send({
              code: "RESOURCE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow resource management",
              requestId: request.id,
            });

          case "organization_archived":
            return reply.code(409).send({
              code: "ORGANIZATION_ARCHIVED",
              message: "Restore the organization before making changes",
              requestId: request.id,
            });

          case "organization_suspended":
            return reply.code(409).send({
              code: "ORGANIZATION_SUSPENDED",
              message: "The organization is suspended and read-only",
              requestId: request.id,
            });
        }
      }

      return reply.code(201).send(result.resource);
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
            return reply.code(409).send({
              code: "ORGANIZATION_ARCHIVED",
              message: "Restore the organization before making changes",
              requestId: request.id,
            });

          case "organization_suspended":
            return reply.code(409).send({
              code: "ORGANIZATION_SUSPENDED",
              message: "The organization is suspended and read-only",
              requestId: request.id,
            });
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
            return reply.code(409).send({
              code: "ORGANIZATION_ARCHIVED",
              message: "Restore the organization before making changes",
              requestId: request.id,
            });

          case "organization_suspended":
            return reply.code(409).send({
              code: "ORGANIZATION_SUSPENDED",
              message: "The organization is suspended and read-only",
              requestId: request.id,
            });
        }
      }

      return reply.code(204).send();
    },
  );
};
