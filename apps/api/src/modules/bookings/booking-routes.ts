import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type, { type TSchema } from "typebox";
import { Check } from "typebox/value";
import { requireVerifiedUser } from "../../http/auth-guard.js";
import { uuidSchema } from "../../http/schemas.js";
import { listManagementBookings } from "./booking-query-service.js";

const organizationParamsSchema = Type.Object(
  { organizationId: uuidSchema },
  { additionalProperties: Type.Never() },
);
const bookingRangeQuerySchema = Type.Object(
  {
    fromDate: Type.String(),
    toDate: Type.String(),
  },
  { additionalProperties: Type.Never() },
);

export const bookingRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.setValidatorCompiler(
    ({ schema }) =>
      (value) =>
        Check(schema as TSchema, value)
          ? { value }
          : { error: new Error("Invalid request") },
  );
  app.decorateRequest("verifiedUser");
  app.addHook("preHandler", requireVerifiedUser);

  app.get(
    "/api/organizations/:organizationId/bookings",
    {
      schema: {
        params: organizationParamsSchema,
        querystring: bookingRangeQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await listManagementBookings({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
        fromDate: request.query.fromDate,
        toDate: request.query.toDate,
      });
      if (!result.ok) {
        if (result.reason === "invalid_date_range")
          return reply.code(400).send({
            code: "INVALID_BOOKING_DATE_RANGE",
            message: "Booking date range is invalid",
            requestId: request.id,
          });
        return reply.code(404).send({
          code: "ORGANIZATION_NOT_FOUND",
          message: "Organization not found",
          requestId: request.id,
        });
      }

      return reply.code(200).send(result.schedule);
    },
  );
};
