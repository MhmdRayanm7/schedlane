import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import {
  getResourceDateOverride,
  replaceResourceDateOverride,
} from "../application/resource-date-overrides.js";
import { sendAvailabilityError } from "./errors.js";
import {
  availabilityModeSchema,
  minuteIntervalSchema,
  resourceAvailabilityDateParamsSchema,
} from "./schemas.js";

// Calendar validity is checked in the service, preserving the focused domain error.
const body = Type.Object(
  {
    mode: availabilityModeSchema,
    intervals: Type.Array(minuteIntervalSchema),
  },
  { additionalProperties: Type.Never() },
);

export const resourceDateOverrideRoutes: FastifyPluginAsyncTypebox = async (
  app,
) => {
  app.get(
    "/api/organizations/:organizationId/resources/:resourceId/availability/date-overrides/:date",
    { schema: { params: resourceAvailabilityDateParamsSchema } },
    async (request, reply) => {
      const result = await getResourceDateOverride({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(200).send(result.override);
    },
  );
  app.put(
    "/api/organizations/:organizationId/resources/:resourceId/availability/date-overrides/:date",
    {
      schema: { params: resourceAvailabilityDateParamsSchema, body },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError) {
        if (request.validationError.validationContext === "body")
          return sendAvailabilityError(
            reply,
            request.id,
            "invalid_date_override",
          );
        throw request.validationError;
      }
      const result = await replaceResourceDateOverride({
        userId: request.verifiedUser.id,
        ...request.params,
        ...request.body,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(200).send(result.override);
    },
  );
};
