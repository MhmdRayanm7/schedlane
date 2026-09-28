import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { config } from "../../../config.js";
import { getApplicantOrganizationRequest } from "../application/request-queries.js";
import { createOrganizationRequest } from "../application/requests.js";

const createOrganizationRequestBody = Type.Object({
  name: Type.String({
    minLength: 1,
    maxLength: 120,
    pattern: ".*\\S.*",
  }),
  description: Type.String({
    minLength: 10,
    maxLength: 2000,
    pattern: ".*\\S.*",
  }),
  contactPhone: Type.Optional(
    Type.String({ minLength: 1, maxLength: 80, pattern: ".*\\S.*" }),
  ),
  additionalContext: Type.Optional(
    Type.String({ minLength: 1, maxLength: 2000, pattern: ".*\\S.*" }),
  ),
  wantsSetupHelp: Type.Boolean(),
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
      config: {
        rateLimit: {
          max: config.ORGANIZATION_REQUEST_RATE_LIMIT_MAX,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const organizationRequest = await createOrganizationRequest({
        requestedByUserId: user.id,
        name: request.body.name,
        description: request.body.description,
        contactPhone: request.body.contactPhone,
        additionalContext: request.body.additionalContext,
        wantsSetupHelp: request.body.wantsSetupHelp,
      });

      if (!organizationRequest.ok) {
        return reply.code(409).send({
          code: "ORGANIZATION_REQUEST_PENDING",
          message: "You already have a pending organization request",
          requestId: request.id,
        });
      }

      return reply.code(201).send(organizationRequest.request);
    },
  );

  app.get("/api/organization-requests/me", async (request, reply) => {
    const result = await getApplicantOrganizationRequest(
      request.verifiedUser.id,
    );
    return reply.code(200).send(result);
  });
};
