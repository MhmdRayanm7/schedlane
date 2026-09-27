import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { approveOrganizationRequest } from "../application/approval.js";
import {
  getPlatformAdminIdentity,
  listPlatformOrganizations,
} from "../application/platform.js";
import {
  publishOrganization,
  rejectPublicationRequest,
  unpublishOrganization,
} from "../application/publication-decisions.js";
import {
  getPlatformPublicationRequest,
  listPublicationRequests,
} from "../application/publication-platform.js";
import { rejectOrganizationRequest } from "../application/rejection.js";
import {
  getPlatformOrganizationRequest,
  listOrganizationRequests,
} from "../application/request-queries.js";
import {
  suspendOrganization,
  unsuspendOrganization,
} from "../application/suspension.js";
import {
  organizationParamsSchema,
  organizationRequestParamsSchema,
  publicationRequestParamsSchema,
} from "./schemas.js";

const approveOrganizationRequestBody = Type.Object({
  slug: Type.String({
    minLength: 1,
    maxLength: 80,
    pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
  }),
});

const rejectOrganizationRequestBody = Type.Object({
  reason: Type.String({
    minLength: 1,
    maxLength: 500,
    pattern: ".*\\S.*",
  }),
});

const listOrganizationsQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  cursor: Type.Optional(Type.String({ minLength: 1 })),
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

const listPublicationRequestsQuery = Type.Object({
  status: Type.Optional(
    Type.Union([
      Type.Literal("pending"),
      Type.Literal("approved"),
      Type.Literal("rejected"),
    ]),
  ),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});

const publicationReasonBody = Type.Object(
  {
    reason: Type.String({
      minLength: 1,
      maxLength: 500,
      pattern: ".*\\S.*",
    }),
  },
  { additionalProperties: Type.Never() },
);

export const platformRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // ---------------------------------------------------------------------------
  // Platform administration
  // ---------------------------------------------------------------------------

  app.get("/api/platform/me", async (request, reply) => {
    const result = await getPlatformAdminIdentity(request.verifiedUser.id);
    if (!result.ok) {
      return reply.code(403).send({
        code: "PLATFORM_ADMIN_REQUIRED",
        message: "Platform administrator access required",
        requestId: request.id,
      });
    }
    return reply.code(200).send(result.admin);
  });

  app.get(
    "/api/platform/organization-requests",
    {
      schema: {
        querystring: listOrganizationRequestsQuery,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

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

  app.get(
    "/api/platform/publication-requests",
    { schema: { querystring: listPublicationRequestsQuery } },
    async (request, reply) => {
      const result = await listPublicationRequests({
        userId: request.verifiedUser.id,
        status: request.query.status,
        limit: request.query.limit ?? 50,
      });
      if (!result.ok) {
        return reply.code(403).send({
          code: "PLATFORM_ADMIN_REQUIRED",
          message: "Platform administrator access required",
          requestId: request.id,
        });
      }
      return reply.code(200).send({ items: result.items });
    },
  );

  app.get(
    "/api/platform/publication-requests/:requestId",
    { schema: { params: publicationRequestParamsSchema } },
    async (request, reply) => {
      const result = await getPlatformPublicationRequest({
        userId: request.verifiedUser.id,
        requestId: request.params.requestId,
      });
      if (!result.ok) {
        const forbidden = result.reason === "platform_admin_required";
        return reply.code(forbidden ? 403 : 404).send({
          code: forbidden
            ? "PLATFORM_ADMIN_REQUIRED"
            : "PUBLICATION_REQUEST_NOT_FOUND",
          message: forbidden
            ? "Platform administrator access required"
            : "Publication request not found",
          requestId: request.id,
        });
      }
      return reply.code(200).send(result.request);
    },
  );

  app.post(
    "/api/platform/publication-requests/:requestId/publish",
    { schema: { params: publicationRequestParamsSchema } },
    async (request, reply) => {
      const result = await publishOrganization({
        userId: request.verifiedUser.id,
        requestId: request.params.requestId,
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
              code: "PUBLICATION_REQUEST_NOT_FOUND",
              message: "Publication request not found",
              requestId: request.id,
            });
          case "request_not_pending":
            return reply.code(409).send({
              code: "PUBLICATION_REQUEST_NOT_PENDING",
              message: "Publication request is no longer pending",
              requestId: request.id,
            });
          case "already_published":
            return reply.code(409).send({
              code: "ORGANIZATION_ALREADY_PUBLISHED",
              message: "Organization is already published",
              requestId: request.id,
            });
          case "readiness_changed":
            return reply.code(409).send({
              code: "PUBLICATION_READINESS_CHANGED",
              message: "Organization readiness changed after the request",
              readiness: result.readiness,
              requestId: request.id,
            });
        }
      }
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/api/platform/publication-requests/:requestId/reject",
    {
      schema: {
        params: publicationRequestParamsSchema,
        body: publicationReasonBody,
      },
    },
    async (request, reply) => {
      const result = await rejectPublicationRequest({
        userId: request.verifiedUser.id,
        requestId: request.params.requestId,
        reason: request.body.reason,
      });
      if (!result.ok) {
        const status =
          result.reason === "platform_admin_required"
            ? 403
            : result.reason === "request_not_found"
              ? 404
              : 409;
        return reply.code(status).send({
          code:
            result.reason === "platform_admin_required"
              ? "PLATFORM_ADMIN_REQUIRED"
              : result.reason === "request_not_found"
                ? "PUBLICATION_REQUEST_NOT_FOUND"
                : "PUBLICATION_REQUEST_NOT_PENDING",
          message:
            status === 403
              ? "Platform administrator access required"
              : status === 404
                ? "Publication request not found"
                : "Publication request is no longer pending",
          requestId: request.id,
        });
      }
      return reply.code(200).send(result.request);
    },
  );

  app.post(
    "/api/platform/organizations/:organizationId/unpublish",
    {
      schema: {
        params: organizationParamsSchema,
        body: publicationReasonBody,
      },
    },
    async (request, reply) => {
      const result = await unpublishOrganization({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
        reason: request.body.reason,
      });
      if (!result.ok) {
        const status =
          result.reason === "platform_admin_required"
            ? 403
            : result.reason === "organization_not_found"
              ? 404
              : 409;
        return reply.code(status).send({
          code:
            result.reason === "platform_admin_required"
              ? "PLATFORM_ADMIN_REQUIRED"
              : result.reason === "organization_not_found"
                ? "ORGANIZATION_NOT_FOUND"
                : "ORGANIZATION_NOT_PUBLISHED",
          message:
            status === 403
              ? "Platform administrator access required"
              : status === 404
                ? "Organization not found"
                : "Organization is not published",
          requestId: request.id,
        });
      }
      return reply.code(200).send(result);
    },
  );

  app.get(
    "/api/platform/organization-requests/:requestId",
    { schema: { params: organizationRequestParamsSchema } },
    async (request, reply) => {
      const result = await getPlatformOrganizationRequest({
        userId: request.verifiedUser.id,
        requestId: request.params.requestId,
      });

      if (!result.ok) {
        const forbidden = result.reason === "platform_admin_required";
        return reply.code(forbidden ? 403 : 404).send({
          code: forbidden
            ? "PLATFORM_ADMIN_REQUIRED"
            : "ORGANIZATION_REQUEST_NOT_FOUND",
          message: forbidden
            ? "Platform administrator access required"
            : "Organization request not found",
          requestId: request.id,
        });
      }

      return reply.code(200).send(result.request);
    },
  );

  app.get(
    "/api/platform/organizations",
    { schema: { querystring: listOrganizationsQuery } },
    async (request, reply) => {
      const result = await listPlatformOrganizations({
        userId: request.verifiedUser.id,
        limit: request.query.limit ?? 20,
        cursor: request.query.cursor,
      });
      if (!result.ok) {
        if (result.reason === "platform_admin_required") {
          return reply.code(403).send({
            code: "PLATFORM_ADMIN_REQUIRED",
            message: "Platform administrator access required",
            requestId: request.id,
          });
        }
        return reply.code(400).send({
          code: "INVALID_CURSOR",
          message: "The pagination cursor is invalid",
          requestId: request.id,
        });
      }
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/api/platform/organization-requests/:requestId/approve",
    {
      schema: {
        params: organizationRequestParamsSchema,
        body: approveOrganizationRequestBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

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
        params: organizationRequestParamsSchema,
        body: rejectOrganizationRequestBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await rejectOrganizationRequest({
        requestId: request.params.requestId,
        reviewedByUserId: user.id,
        reason: request.body.reason,
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

  app.post(
    "/api/platform/organizations/:organizationId/suspend",
    {
      schema: {
        params: organizationParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await suspendOrganization({
        userId: user.id,
        organizationId: request.params.organizationId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "platform_admin_required":
            return reply.code(403).send({
              code: "PLATFORM_ADMIN_REQUIRED",
              message: "Platform administrator access required",
              requestId: request.id,
            });

          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "already_suspended":
            return reply.code(409).send({
              code: "ORGANIZATION_ALREADY_SUSPENDED",
              message: "Organization is already suspended",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send(result.organization);
    },
  );

  app.post(
    "/api/platform/organizations/:organizationId/unsuspend",
    {
      schema: {
        params: organizationParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await unsuspendOrganization({
        userId: user.id,
        organizationId: request.params.organizationId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "platform_admin_required":
            return reply.code(403).send({
              code: "PLATFORM_ADMIN_REQUIRED",
              message: "Platform administrator access required",
              requestId: request.id,
            });

          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "not_suspended":
            return reply.code(409).send({
              code: "ORGANIZATION_NOT_SUSPENDED",
              message: "Organization is not suspended",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send(result.organization);
    },
  );
};
