import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { config } from "../../../config.js";
import { emailService } from "../../../email/index.js";
import { listOrganizationInvitations } from "../organization-invitation-query-service.js";
import {
  acceptOrganizationInvitation,
  createOrganizationInvitation,
  revokeInvitationAfterDeliveryFailure,
  revokeOrganizationInvitation,
} from "../organization-invitation-service.js";
import { sendOrganizationWriteStateError } from "./errors.js";
import {
  organizationInvitationParamsSchema,
  organizationParamsSchema,
  uuidSchema,
} from "./schemas.js";

const createOrganizationInvitationBody = Type.Object({
  email: Type.String({
    format: "email",
    maxLength: 254,
  }),
  role: Type.Union([
    Type.Literal("owner"),
    Type.Literal("manager"),
    Type.Literal("staff"),
  ]),
  resourceId: Type.Optional(uuidSchema),
});

const acceptOrganizationInvitationBody = Type.Object({
  token: Type.String({
    minLength: 1,
    maxLength: 256,
  }),
});

export const invitationRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // ---------------------------------------------------------------------------
  // Organization invitations
  // ---------------------------------------------------------------------------

  app.get(
    "/api/organizations/:organizationId/invitations",
    {
      schema: {
        params: organizationParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await listOrganizationInvitations({
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
              code: "ORGANIZATION_INVITATION_NOT_ALLOWED",
              message:
                "Your organization role does not allow invitation management",
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
    "/api/organizations/:organizationId/invitations",
    {
      schema: {
        params: organizationParamsSchema,
        body: createOrganizationInvitationBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await createOrganizationInvitation({
        invitedByUserId: user.id,
        organizationId: request.params.organizationId,
        email: request.body.email,
        role: request.body.role,
        ...(request.body.resourceId !== undefined
          ? {
              resourceId: request.body.resourceId,
            }
          : {}),
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
              code: "ORGANIZATION_INVITATION_NOT_ALLOWED",
              message: "Your organization role does not allow this invitation",
              requestId: request.id,
            });

          case "already_member":
            return reply.code(409).send({
              code: "ORGANIZATION_MEMBER_ALREADY_EXISTS",
              message: "This user is already an organization member",
              requestId: request.id,
            });

          case "invitation_already_pending":
            return reply.code(409).send({
              code: "ORGANIZATION_INVITATION_ALREADY_PENDING",
              message: "An active invitation already exists for this email",
              requestId: request.id,
            });

          case "resource_required":
            return reply.code(400).send({
              code: "STAFF_INVITATION_RESOURCE_REQUIRED",
              message: "A Staff invitation must target a Resource",
              requestId: request.id,
            });

          case "resource_not_allowed":
            return reply.code(400).send({
              code: "INVITATION_RESOURCE_NOT_ALLOWED",
              message: "Only Staff invitations may target a Resource",
              requestId: request.id,
            });

          case "resource_not_found":
            return reply.code(404).send({
              code: "RESOURCE_NOT_FOUND",
              message: "Resource not found",
              requestId: request.id,
            });

          case "resource_deactivated":
            return reply.code(409).send({
              code: "RESOURCE_DEACTIVATED",
              message: "The Resource is deactivated",
              requestId: request.id,
            });

          case "resource_already_linked":
            return reply.code(409).send({
              code: "RESOURCE_ALREADY_LINKED",
              message: "The Resource is already linked to a user",
              requestId: request.id,
            });

          case "resource_invitation_already_pending":
            return reply.code(409).send({
              code: "RESOURCE_INVITATION_ALREADY_PENDING",
              message: "An active invitation already targets this Resource",
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

      const invitationUrl = new URL("/invitations/accept", config.WEB_ORIGIN);

      // Raw invitation tokens are used only for delivery.
      invitationUrl.searchParams.set("token", result.token);

      try {
        await emailService.send({
          to: result.invitation.email,
          subject: "You've been invited to Schedlane",
          text: [
            `You have been invited to join an organization as ${result.invitation.role}.`,
            "",
            `Accept the invitation: ${invitationUrl.toString()}`,
            "",
            `This invitation expires at ${result.invitation.expiresAt}.`,
          ].join("\n"),
        });
      } catch (error) {
        // Failed delivery must not leave an undisclosed active invitation.
        await revokeInvitationAfterDeliveryFailure(result.invitation.id);

        request.log.error(
          {
            err: error,
            invitationId: result.invitation.id,
          },
          "Failed to deliver organization invitation",
        );

        return reply.code(502).send({
          code: "INVITATION_EMAIL_DELIVERY_FAILED",
          message: "The invitation email could not be delivered",
          requestId: request.id,
        });
      }

      return reply.code(201).send({
        invitation: result.invitation,
      });
    },
  );

  app.post(
    "/api/organizations/:organizationId/invitations/:invitationId/revoke",
    {
      schema: {
        params: organizationInvitationParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await revokeOrganizationInvitation({
        userId: user.id,
        organizationId: request.params.organizationId,
        invitationId: request.params.invitationId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "invitation_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_INVITATION_NOT_FOUND",
              message: "Organization invitation not found",
              requestId: request.id,
            });

          case "insufficient_role":
            return reply.code(403).send({
              code: "ORGANIZATION_INVITATION_NOT_ALLOWED",
              message: "Your organization role does not allow this action",
              requestId: request.id,
            });

          case "invitation_already_accepted":
            return reply.code(409).send({
              code: "ORGANIZATION_INVITATION_ALREADY_ACCEPTED",
              message: "The invitation has already been accepted",
              requestId: request.id,
            });

          case "invitation_already_revoked":
            return reply.code(409).send({
              code: "ORGANIZATION_INVITATION_ALREADY_REVOKED",
              message: "The invitation has already been revoked",
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

      return reply.code(200).send(result.invitation);
    },
  );

  app.post(
    "/api/organization-invitations/accept",
    {
      schema: {
        body: acceptOrganizationInvitationBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await acceptOrganizationInvitation({
        userId: user.id,
        userEmail: user.email,
        token: request.body.token,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "invitation_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_INVITATION_NOT_FOUND",
              message: "Organization invitation not found",
              requestId: request.id,
            });

          case "invitation_revoked":
            return reply.code(409).send({
              code: "ORGANIZATION_INVITATION_REVOKED",
              message: "The invitation has been revoked",
              requestId: request.id,
            });

          case "invitation_expired":
            return reply.code(409).send({
              code: "ORGANIZATION_INVITATION_EXPIRED",
              message: "The invitation has expired",
              requestId: request.id,
            });

          case "invitation_already_accepted":
            return reply.code(409).send({
              code: "ORGANIZATION_INVITATION_ALREADY_ACCEPTED",
              message: "The invitation has already been accepted",
              requestId: request.id,
            });

          case "email_mismatch":
            return reply.code(403).send({
              code: "ORGANIZATION_INVITATION_EMAIL_MISMATCH",
              message: "This invitation belongs to another account",
              requestId: request.id,
            });

          case "already_member":
            return reply.code(409).send({
              code: "ORGANIZATION_MEMBER_ALREADY_EXISTS",
              message: "You are already a member of this organization",
              requestId: request.id,
            });

          case "resource_not_found":
            return reply.code(409).send({
              code: "INVITATION_RESOURCE_UNAVAILABLE",
              message: "The invitation no longer has an available Resource",
              requestId: request.id,
            });

          case "resource_deactivated":
            return reply.code(409).send({
              code: "RESOURCE_DEACTIVATED",
              message: "The Resource is deactivated",
              requestId: request.id,
            });

          case "resource_already_linked":
            return reply.code(409).send({
              code: "RESOURCE_ALREADY_LINKED",
              message: "The Resource is already linked to another user",
              requestId: request.id,
            });

          case "user_resource_already_linked":
            return reply.code(409).send({
              code: "USER_RESOURCE_ALREADY_LINKED",
              message:
                "You are already linked to a Resource in this organization",
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
        organizationId: result.organizationId,
        role: result.role,
        resourceId: result.resourceId,
        acceptedAt: result.acceptedAt,
      });
    },
  );
};
