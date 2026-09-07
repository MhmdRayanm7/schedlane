import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { requireVerifiedUser } from "../../http/auth-guard.js";
import { listOrganizationResources } from "./resource-query-service.js";
import { createResource } from "./resource-service.js";

const organizationParams = Type.Object({
  organizationId: Type.String({
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
  app.get(
    "/api/organizations/:organizationId/resources",
    {
      schema: {
        params: organizationParams,
      },
    },
    async (request, reply) => {
      const user = await requireVerifiedUser(request, reply);

      if (!user) {
        return;
      }

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
      const user = await requireVerifiedUser(request, reply);

      if (!user) {
        return;
      }

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
};
