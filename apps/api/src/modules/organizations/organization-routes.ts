import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { requireVerifiedUser } from "../../http/auth-guard.js";
import { approveOrganizationRequest } from "./organization-approval-service.js";
import {
  archiveOrganization,
  restoreOrganization,
} from "./organization-lifecycle-service.js";
import { listOrganizationMembers } from "./organization-member-query-service.js";
import {
  getUserOrganization,
  listUserOrganizations,
} from "./organization-query-service.js";
import { rejectOrganizationRequest } from "./organization-rejection-service.js";
import { listOrganizationRequests } from "./organization-request-query-service.js";
import { createOrganizationRequest } from "./organization-request-service.js";
import { updateStaffTeamVisibility } from "./organization-settings-service.js";
import { renameOrganization } from "./organization-update-service.js";

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

const organizationParams = Type.Object({
  organizationId: Type.String({
    pattern:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
  }),
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

const renameOrganizationBody = Type.Object({
  name: Type.String({
    minLength: 1,
    maxLength: 120,
    pattern: ".*\\S.*",
  }),
});

const updateStaffTeamVisibilityBody = Type.Object({
  staffTeamVisibility: Type.Union([Type.Literal("team"), Type.Literal("self")]),
});

export const organizationRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get("/api/organizations", async (request, reply) => {
    const user = await requireVerifiedUser(request, reply);

    if (!user) {
      return;
    }

    // Organization access is derived from the authenticated user's memberships.
    const result = await listUserOrganizations({
      userId: user.id,
    });

    return reply.code(200).send(result);
  });

  app.get(
    "/api/organizations/:organizationId",
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

      const organization = await getUserOrganization({
        userId: user.id,
        organizationId: request.params.organizationId,
      });

      if (!organization) {
        return reply.code(404).send({
          code: "ORGANIZATION_NOT_FOUND",
          message: "Organization not found",
          requestId: request.id,
        });
      }

      return reply.code(200).send(organization);
    },
  );

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

  app.get(
    "/api/organizations/:organizationId/members",
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
    "/api/organizations/:organizationId",
    {
      schema: {
        params: organizationParams,
        body: renameOrganizationBody,
      },
    },
    async (request, reply) => {
      const user = await requireVerifiedUser(request, reply);

      if (!user) {
        return;
      }

      const result = await renameOrganization({
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
              code: "INSUFFICIENT_ORGANIZATION_ROLE",
              message: "Your organization role does not allow this action",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send(result.organization);
    },
  );

  app.patch(
    "/api/organizations/:organizationId/settings/staff-team-visibility",
    {
      schema: {
        params: organizationParams,
        body: updateStaffTeamVisibilityBody,
      },
    },
    async (request, reply) => {
      const user = await requireVerifiedUser(request, reply);

      if (!user) {
        return;
      }

      const result = await updateStaffTeamVisibility({
        userId: user.id,
        organizationId: request.params.organizationId,
        visibility: request.body.staffTeamVisibility,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "owner_required":
            return reply.code(403).send({
              code: "ORGANIZATION_OWNER_REQUIRED",
              message: "Organization owner access required",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send({
        staffTeamVisibility: result.staffTeamVisibility,
      });
    },
  );

  app.post(
    "/api/organizations/:organizationId/archive",
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

      const result = await archiveOrganization({
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

          case "owner_required":
            return reply.code(403).send({
              code: "ORGANIZATION_OWNER_REQUIRED",
              message: "Organization owner access required",
              requestId: request.id,
            });

          case "already_archived":
            return reply.code(409).send({
              code: "ORGANIZATION_ALREADY_ARCHIVED",
              message: "Organization is already archived",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send(result.organization);
    },
  );

  app.post(
    "/api/organizations/:organizationId/restore",
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

      const result = await restoreOrganization({
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

          case "owner_required":
            return reply.code(403).send({
              code: "ORGANIZATION_OWNER_REQUIRED",
              message: "Organization owner access required",
              requestId: request.id,
            });

          case "not_archived":
            return reply.code(409).send({
              code: "ORGANIZATION_NOT_ARCHIVED",
              message: "Organization is not archived",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send(result.organization);
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
