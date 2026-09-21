import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import {
  getOrganizationDateOverride,
  replaceOrganizationDateOverride,
} from "../application/organization-date-overrides.js";
import { sendAvailabilityError } from "./errors.js";
import {
  availabilityModeSchema,
  minuteIntervalSchema,
  organizationAvailabilityDateParamsSchema,
} from "./schemas.js";

// Calendar validity is checked in the service, preserving the focused domain error.
const body = Type.Object(
  {
    mode: availabilityModeSchema,
    intervals: Type.Array(minuteIntervalSchema),
  },
  { additionalProperties: Type.Never() },
);

export const organizationDateOverrideRoutes: FastifyPluginAsyncTypebox = async (
  app,
) => {
  app.get(
    "/api/organizations/:organizationId/availability/date-overrides/:date",
    { schema: { params: organizationAvailabilityDateParamsSchema } },
    async (request, reply) => {
      const result = await getOrganizationDateOverride({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(200).send(result.override);
    },
  );
  app.put(
    "/api/organizations/:organizationId/availability/date-overrides/:date",
    {
      schema: { params: organizationAvailabilityDateParamsSchema, body },
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
      const result = await replaceOrganizationDateOverride({
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
