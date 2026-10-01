import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply } from "fastify";
import Type from "typebox";
import { requireVerifiedUser } from "../../../http/auth-guard.js";
import { uuidSchema } from "../../../http/schemas.js";
import { typeboxValidatorCompiler } from "../../../http/typebox-validator.js";
import {
  type CreateBookingShareLinkFailure,
  createBookingShareLink,
  listBookingShareLinks,
  revokeBookingShareLink,
} from "../application/booking-share-links.js";

const organizationParams = Type.Object(
  { organizationId: uuidSchema },
  { additionalProperties: Type.Never() },
);
const linkParams = Type.Object(
  { organizationId: uuidSchema, linkId: uuidSchema },
  { additionalProperties: Type.Never() },
);
const createBody = Type.Object(
  {
    serviceId: Type.Optional(uuidSchema),
    resourceId: Type.Optional(uuidSchema),
  },
  { additionalProperties: Type.Never() },
);

function sendAccessError(
  reply: FastifyReply,
  requestId: string,
  reason: "organization_not_found" | "insufficient_role",
) {
  return reason === "organization_not_found"
    ? reply.code(404).send({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found",
        requestId,
      })
    : reply.code(403).send({
        code: "BOOKING_SHARE_LINK_MANAGEMENT_NOT_ALLOWED",
        message: "Only an Organization Owner can manage booking share links",
        requestId,
      });
}

function sendCreateError(
  reply: FastifyReply,
  requestId: string,
  reason: CreateBookingShareLinkFailure,
) {
  if (reason === "organization_not_found" || reason === "insufficient_role")
    return sendAccessError(reply, requestId, reason);
  const errors = {
    booking_share_scope_invalid: [
      400,
      "BOOKING_SHARE_SCOPE_INVALID",
      "Select a Service, a Resource, or both",
    ],
    service_not_found: [404, "SERVICE_NOT_FOUND", "Service not found"],
    service_inactive: [409, "SERVICE_INACTIVE", "Service is inactive"],
    resource_not_found: [404, "RESOURCE_NOT_FOUND", "Resource not found"],
    resource_inactive: [409, "RESOURCE_INACTIVE", "Resource is inactive"],
    service_not_assigned: [
      409,
      "SERVICE_NOT_ASSIGNED",
      "The selected scope has no active Service and Resource assignment",
    ],
    organization_archived: [
      409,
      "ORGANIZATION_ARCHIVED",
      "Restore the organization before making changes",
    ],
    organization_suspended: [
      409,
      "ORGANIZATION_SUSPENDED",
      "The organization is suspended and read-only",
    ],
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

export const bookingShareLinkRoutes: FastifyPluginAsyncTypebox = async (
  app,
) => {
  app.decorateRequest("verifiedUser");
  app.addHook("preHandler", requireVerifiedUser);
  app.setValidatorCompiler(typeboxValidatorCompiler);

  app.get(
    "/api/organizations/:organizationId/booking-share-links",
    { schema: { params: organizationParams } },
    async (request, reply) => {
      const result = await listBookingShareLinks({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
      });
      if (!result.ok) return sendAccessError(reply, request.id, result.reason);
      return reply.code(200).send({ items: result.items });
    },
  );

  app.post(
    "/api/organizations/:organizationId/booking-share-links",
    { schema: { params: organizationParams, body: createBody } },
    async (request, reply) => {
      const result = await createBookingShareLink({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
        ...request.body,
      });
      if (!result.ok) return sendCreateError(reply, request.id, result.reason);
      return reply.code(201).send(result.link);
    },
  );

  app.post(
    "/api/organizations/:organizationId/booking-share-links/:linkId/revoke",
    { schema: { params: linkParams } },
    async (request, reply) => {
      const result = await revokeBookingShareLink({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok) {
        if (
          result.reason === "organization_not_found" ||
          result.reason === "insufficient_role"
        )
          return sendAccessError(reply, request.id, result.reason);
        if (result.reason === "booking_share_link_not_found")
          return reply.code(404).send({
            code: "BOOKING_SHARE_LINK_NOT_FOUND",
            message: "Booking share link not found",
            requestId: request.id,
          });
        if (result.reason === "booking_share_link_revoked")
          return reply.code(409).send({
            code: "BOOKING_SHARE_LINK_REVOKED",
            message: "Booking share link is already revoked",
            requestId: request.id,
          });
        return sendCreateError(reply, request.id, result.reason);
      }
      return reply.code(200).send(result.link);
    },
  );
};
