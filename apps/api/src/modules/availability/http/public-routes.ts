import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply } from "fastify";
import Type from "typebox";
import { uuidSchema } from "../../../http/schemas.js";
import { typeboxValidatorCompiler } from "../../../http/typebox-validator.js";
import {
  type ResolvePublicResourceServiceAvailabilityResult,
  resolvePublicResourceServiceAvailability,
} from "../resolvers/public-resource-service-availability.js";

type PublicAvailabilityRoutesOptions = {
  now?: () => Date;
};

const paramsSchema = Type.Object(
  { slug: Type.String() },
  { additionalProperties: Type.Never() },
);
const querySchema = Type.Object(
  {
    resourceId: uuidSchema,
    serviceId: uuidSchema,
    date: Type.String(),
  },
  { additionalProperties: Type.Never() },
);

function sendPublicAvailabilityError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<
    ResolvePublicResourceServiceAvailabilityResult,
    { ok: false }
  >["reason"],
) {
  if (reason === "invalid_date")
    return reply.code(400).send({
      code: "INVALID_DATE",
      message: "Date must be a valid YYYY-MM-DD calendar date",
      requestId,
    });
  if (reason === "date_outside_booking_window")
    return reply.code(400).send({
      code: "DATE_OUTSIDE_BOOKING_WINDOW",
      message: "Date is outside the public booking window",
      requestId,
    });
  return reply.code(404).send({
    code: "PUBLIC_AVAILABILITY_NOT_FOUND",
    message: "Public availability not found",
    requestId,
  });
}

export const publicAvailabilityRoutes: FastifyPluginAsyncTypebox<
  PublicAvailabilityRoutesOptions
> = async (app, options) => {
  app.setValidatorCompiler(typeboxValidatorCompiler);

  app.get(
    "/api/public/organizations/:slug/availability",
    { schema: { params: paramsSchema, querystring: querySchema } },
    async (request, reply) => {
      const result = await resolvePublicResourceServiceAvailability(
        {
          organizationSlug: request.params.slug,
          resourceId: request.query.resourceId,
          serviceId: request.query.serviceId,
          date: request.query.date,
        },
        options.now?.() ?? new Date(),
      );
      if (!result.ok)
        return sendPublicAvailabilityError(reply, request.id, result.reason);
      return reply.code(200).send({
        timezone: result.availability.timezone,
        resourceId: result.availability.resourceId,
        serviceId: result.availability.serviceId,
        date: result.availability.date,
        starts: result.availability.starts,
      });
    },
  );
};
