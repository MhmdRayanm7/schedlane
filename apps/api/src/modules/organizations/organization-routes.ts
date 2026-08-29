import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { fromNodeHeaders } from "better-auth/node";
import Type from "typebox";
import { auth } from "../../auth.js";
import { approveOrganizationRequest } from "./organization-approval-service.js";
import { createOrganizationRequest } from "./organization-request-service.js";

const createOrganizationRequestBody = Type.Object({
  name: Type.String({
    minLength: 1,
    pattern: ".*\\S.*",
  }),
});

const approveOrganizationRequestParams = Type.Object({
  requestId: Type.String({
    minLength: 1,
  }),
});

const approveOrganizationRequestBody = Type.Object({
  slug: Type.String({
    minLength: 1,
    pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
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

  app.post(
    "/api/platform/organization-requests/:requestId/approve",
    {
      schema: {
        params: approveOrganizationRequestParams,
        body: approveOrganizationRequestBody,
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

      const result = await approveOrganizationRequest({
        requestId: request.params.requestId,
        reviewedByUserId: session.user.id,
        slug: request.body.slug,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "platform_admin_required":
            return reply.code(403).send({
              code: "PLATFORM_ADMIN_REQUIRED",
              message: "Platform administrator access required",
              requestId: request.id,
            });

          case "request_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_REQUEST_NOT_FOUND",
              message: "Organization request not found",
              requestId: request.id,
            });

          case "request_not_pending":
            return reply.code(409).send({
              code: "ORGANIZATION_REQUEST_NOT_PENDING",
              message: "Organization request is no longer pending",
              requestId: request.id,
            });

          case "slug_taken":
            return reply.code(409).send({
              code: "ORGANIZATION_SLUG_TAKEN",
              message: "Organization slug is already in use",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send(result);
    },
  );
};
