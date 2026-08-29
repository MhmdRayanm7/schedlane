import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { fromNodeHeaders } from "better-auth/node";
import Type from "typebox";
import { auth } from "../../auth.js";
import { createOrganizationRequest } from "./organization-request-service.js";

const createOrganizationRequestBody = Type.Object({
  name: Type.String({
    minLength: 1,
    pattern: ".*\\S.*",
  }),
});

export const organizationRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    "/api/organization-requests",
    {
      schema: {
        body: createOrganizationRequestBody,
      },
    },
    async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "Authentication required",
          requestId: request.id,
        });
      }

      if (!session.user.emailVerified) {
        return reply.code(403).send({
          code: "EMAIL_NOT_VERIFIED",
          message: "Email verification required",
          requestId: request.id,
        });
      }

      const organizationRequest = await createOrganizationRequest({
        requestedByUserId: session.user.id,
        name: request.body.name,
      });

      return reply.code(201).send(organizationRequest);
    },
  );
};
