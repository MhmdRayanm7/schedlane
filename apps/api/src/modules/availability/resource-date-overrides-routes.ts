import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { uuidSchema } from "../../http/schemas.js";
import { sendAvailabilityError } from "./availability-http-errors.js";
import {
  getResourceDateOverride,
  replaceResourceDateOverride,
} from "./resource-date-overrides-service.js";

// Calendar validity is checked in the service, preserving the focused domain error.
const params = Type.Object({
  organizationId: uuidSchema,
  resourceId: uuidSchema,
  date: Type.String(),
});
const body = Type.Object(
  {
    mode: Type.Union([
      Type.Literal("inherit"),
      Type.Literal("closed"),
      Type.Literal("custom"),
    ]),
    intervals: Type.Array(
      Type.Object(
        {
          startMinute: Type.Integer({ minimum: 0, maximum: 1439 }),
          endMinute: Type.Integer({ minimum: 1, maximum: 1440 }),
        },
        { additionalProperties: Type.Never() },
      ),
    ),
  },
  { additionalProperties: Type.Never() },
);

export const resourceDateOverrideRoutes: FastifyPluginAsyncTypebox = async (
  app,
) => {
  app.get(
    "/api/organizations/:organizationId/resources/:resourceId/availability/date-overrides/:date",
    { schema: { params } },
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
    { schema: { params, body }, attachValidation: true },
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
