import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { createOrganizationRequest } from "../organization-request-service.js";

const createOrganizationRequestBody = Type.Object({
  name: Type.String({
    minLength: 1,
    pattern: ".*\\S.*",
  }),
});

export const requestRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // ---------------------------------------------------------------------------
  // Organization requests
  // ---------------------------------------------------------------------------

  app.post(
    "/api/organization-requests",
    {
      schema: {
        body: createOrganizationRequestBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const organizationRequest = await createOrganizationRequest({
        requestedByUserId: user.id,
        name: request.body.name,
      });

      return reply.code(201).send(organizationRequest);
    },
  );
};
