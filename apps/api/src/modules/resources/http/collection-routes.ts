import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sendOrganizationWriteStateError } from "../../organizations/http/errors.js";
import { createResource } from "../application/create.js";
import { listOrganizationResources } from "../application/queries.js";
import { createResourceBody, organizationParams } from "./schemas.js";

export const collectionRoutes: FastifyPluginAsyncTypebox = async (app) => {
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
          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(201).send(result.resource);
    },
  );
};
