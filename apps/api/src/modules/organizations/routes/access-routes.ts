import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { requireVerifiedUser } from "../../../http/auth-guard.js";
import {
  archiveOrganization,
  restoreOrganization,
} from "../organization-lifecycle-service.js";
import {
  getUserOrganization,
  listUserOrganizations,
} from "../organization-query-service.js";
import { updateStaffTeamVisibility } from "../organization-settings-service.js";
import { renameOrganization } from "../organization-update-service.js";
import { sendOrganizationWriteStateError } from "./errors.js";
import { organizationParamsSchema } from "./schemas.js";

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

export const accessRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // ---------------------------------------------------------------------------
  // Organization access, settings, and lifecycle
  // ---------------------------------------------------------------------------

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
        params: organizationParamsSchema,
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

  app.patch(
    "/api/organizations/:organizationId",
    {
      schema: {
        params: organizationParamsSchema,
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

          case "organization_archived":
          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(200).send(result.organization);
    },
  );

  app.patch(
    "/api/organizations/:organizationId/settings/staff-team-visibility",
    {
      schema: {
        params: organizationParamsSchema,
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

          case "organization_archived":
          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
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
        params: organizationParamsSchema,
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

          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(200).send(result.organization);
    },
  );

  app.post(
    "/api/organizations/:organizationId/restore",
    {
      schema: {
        params: organizationParamsSchema,
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

          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(200).send(result.organization);
    },
  );
};
