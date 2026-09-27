import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import {
  archiveOrganization,
  restoreOrganization,
} from "../application/lifecycle.js";
import { getOrganizationPublicationReadiness } from "../application/publication-readiness.js";
import {
  createPublicationRequest,
  getOrganizationPublicationStatus,
} from "../application/publication-requests.js";
import {
  getUserOrganization,
  listUserOrganizations,
} from "../application/queries.js";
import {
  getOrganizationSettings,
  updateOrganizationPricing,
  updateStaffTeamVisibility,
} from "../application/settings.js";
import { renameOrganization } from "../application/update.js";
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

const updatePricingBody = Type.Object(
  { pricingEnabled: Type.Boolean() },
  { additionalProperties: Type.Never() },
);

export const accessRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // ---------------------------------------------------------------------------
  // Organization access, settings, and lifecycle
  // ---------------------------------------------------------------------------

  app.get("/api/organizations", async (request, reply) => {
    const user = request.verifiedUser;

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
      const user = request.verifiedUser;

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
    "/api/organizations/:organizationId/settings",
    {
      schema: {
        params: organizationParamsSchema,
      },
    },
    async (request, reply) => {
      const result = await getOrganizationSettings({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
      });

      if (!result.ok) {
        if (result.reason === "organization_not_found") {
          return reply.code(404).send({
            code: "ORGANIZATION_NOT_FOUND",
            message: "Organization not found",
            requestId: request.id,
          });
        }

        return reply.code(403).send({
          code: "INSUFFICIENT_ORGANIZATION_ROLE",
          message: "Your organization role does not allow this action",
          requestId: request.id,
        });
      }

      return reply.code(200).send(result.settings);
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
      const user = request.verifiedUser;

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
    "/api/organizations/:organizationId/settings/pricing",
    {
      schema: {
        params: organizationParamsSchema,
        body: updatePricingBody,
      },
    },
    async (request, reply) => {
      const result = await updateOrganizationPricing({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
        pricingEnabled: request.body.pricingEnabled,
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
          case "active_services_missing_price":
            return reply.code(409).send({
              code: "ACTIVE_SERVICES_MISSING_PRICE",
              message:
                "Every active Service needs a price before pricing can be enabled",
              services: result.services ?? [],
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
      return reply.code(200).send({ pricingEnabled: result.pricingEnabled });
    },
  );

  app.get(
    "/api/organizations/:organizationId/publication-readiness",
    { schema: { params: organizationParamsSchema } },
    async (request, reply) => {
      const result = await getOrganizationPublicationReadiness({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
      });
      if (!result.ok) {
        const hidden = result.reason === "organization_not_found";
        return reply.code(hidden ? 404 : 403).send({
          code: hidden
            ? "ORGANIZATION_NOT_FOUND"
            : "INSUFFICIENT_ORGANIZATION_ROLE",
          message: hidden
            ? "Organization not found"
            : "Your organization role does not allow this action",
          requestId: request.id,
        });
      }
      return reply.code(200).send(result.readiness);
    },
  );

  app.get(
    "/api/organizations/:organizationId/publication-status",
    { schema: { params: organizationParamsSchema } },
    async (request, reply) => {
      const result = await getOrganizationPublicationStatus({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
      });
      if (!result.ok) {
        const hidden = result.reason === "organization_not_found";
        return reply.code(hidden ? 404 : 403).send({
          code: hidden
            ? "ORGANIZATION_NOT_FOUND"
            : "INSUFFICIENT_ORGANIZATION_ROLE",
          message: hidden
            ? "Organization not found"
            : "Your organization role does not allow this action",
          requestId: request.id,
        });
      }
      return reply.code(200).send(result.status);
    },
  );

  app.post(
    "/api/organizations/:organizationId/publication-requests",
    { schema: { params: organizationParamsSchema } },
    async (request, reply) => {
      const result = await createPublicationRequest({
        userId: request.verifiedUser.id,
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
              message: "Only an Organization Owner can request publication",
              requestId: request.id,
            });
          case "already_published":
            return reply.code(409).send({
              code: "ORGANIZATION_ALREADY_PUBLISHED",
              message: "Organization is already published",
              requestId: request.id,
            });
          case "pending_request_exists":
            return reply.code(409).send({
              code: "PUBLICATION_REQUEST_ALREADY_PENDING",
              message: "A publication request is already pending",
              requestId: request.id,
            });
          case "not_ready":
            return reply.code(409).send({
              code: "PUBLICATION_NOT_READY",
              message: "Organization is not ready for publication",
              readiness: result.readiness,
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
      return reply.code(201).send(result.request);
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
      const user = request.verifiedUser;

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
      const user = request.verifiedUser;

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
      const user = request.verifiedUser;

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
