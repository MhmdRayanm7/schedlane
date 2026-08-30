import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { requireVerifiedUser } from "../../http/auth-guard.js";
import { approveOrganizationRequest } from "./organization-approval-service.js";
import { rejectOrganizationRequest } from "./organization-rejection-service.js";
import { listOrganizationRequests } from "./organization-request-query-service.js";
import { createOrganizationRequest } from "./organization-request-service.js";

const organizationRequestParams = Type.Object({
  requestId: Type.String({
    minLength: 1,
  }),
});

const createOrganizationRequestBody = Type.Object({
  name: Type.String({
    minLength: 1,
    pattern: ".*\\S.*",
  }),
});

const approveOrganizationRequestBody = Type.Object({
  slug: Type.String({
    minLength: 1,
    pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
  }),
});

const rejectOrganizationRequestBody = Type.Object({
  reason: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 500,
      pattern: ".*\\S.*",
    }),
  ),
});

const listOrganizationRequestsQuery = Type.Object({
  status: Type.Optional(
    Type.Union([
      Type.Literal("pending"),
      Type.Literal("approved"),
      Type.Literal("rejected"),
    ]),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
    }),
  ),
  cursor: Type.Optional(
    Type.String({
      minLength: 1,
    }),
  ),
});

export const organizationRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    "/api/platform/organization-requests",
    {
      schema: {
        querystring: listOrganizationRequestsQuery,
      },
    },
    async (request, reply) => {
      const user = await requireVerifiedUser(request, reply);

      if (!user) {
        return;
      }

      const result = await listOrganizationRequests({
        userId: user.id,
        status: request.query.status,
        limit: request.query.limit ?? 20,
        cursor: request.query.cursor,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "platform_admin_required":
            return reply.code(403).send({
              code: "PLATFORM_ADMIN_REQUIRED",
              message: "Platform administrator access required",
              requestId: request.id,
            });

          case "invalid_cursor":
            return reply.code(400).send({
              code: "INVALID_CURSOR",
              message: "The pagination cursor is invalid",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send(result);
    },
  );

  app.post(
    "/api/organization-requests",
    {
      schema: {
        body: createOrganizationRequestBody,
      },
    },
    async (request, reply) => {
      const user = await requireVerifiedUser(request, reply);

      if (!user) {
        return;
      }

      const organizationRequest = await createOrganizationRequest({
        requestedByUserId: user.id,
        name: request.body.name,
      });

      return reply.code(201).send(organizationRequest);
    },
  );

  app.post(
    "/api/platform/organization-requests/:requestId/approve",
    {
      schema: {
        params: organizationRequestParams,
        body: approveOrganizationRequestBody,
      },
    },
    async (request, reply) => {
      const user = await requireVerifiedUser(request, reply);

      if (!user) {
        return;
      }

      const result = await approveOrganizationRequest({
        requestId: request.params.requestId,
        reviewedByUserId: user.id,
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

  app.post(
    "/api/platform/organization-requests/:requestId/reject",
    {
      schema: {
        params: organizationRequestParams,
        body: rejectOrganizationRequestBody,
      },
    },
    async (request, reply) => {
      const user = await requireVerifiedUser(request, reply);

      if (!user) {
        return;
      }

      const result = await rejectOrganizationRequest({
        requestId: request.params.requestId,
        reviewedByUserId: user.id,
        ...(request.body.reason !== undefined
          ? {
              reason: request.body.reason,
            }
          : {}),
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
        }
      }

      return reply.code(200).send(result);
    },
  );
};
