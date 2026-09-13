import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type, { type TSchema } from "typebox";
import { Check } from "typebox/value";
import { requireVerifiedUser } from "../../http/auth-guard.js";
import { uuidSchema } from "../../http/schemas.js";
import { sendAvailabilityError } from "./availability-http-errors.js";
import { getOrganizationWeeklyHours } from "./availability-query-service.js";
import { replaceOrganizationWeeklyHours } from "./availability-service.js";
import { organizationDateOverrideRoutes } from "./organization-date-overrides-routes.js";

import {
  getResourceWeeklyHours,
  replaceResourceWeeklyHours,
} from "./resource-weekly-hours-service.js";

const organizationParams = Type.Object({ organizationId: uuidSchema });
const interval = Type.Object(
  {
    startMinute: Type.Integer({ minimum: 0, maximum: 1439 }),
    endMinute: Type.Integer({ minimum: 1, maximum: 1440 }),
  },
  { additionalProperties: Type.Never() },
);
const weeklyHoursBody = Type.Object(
  {
    days: Type.Array(
      Type.Object(
        {
          weekday: Type.Integer({ minimum: 1, maximum: 7 }),
          intervals: Type.Array(interval),
        },
        { additionalProperties: Type.Never() },
      ),
      { minItems: 7, maxItems: 7 },
    ),
  },
  { additionalProperties: Type.Never() },
);

const resourceParams = Type.Object({
  organizationId: uuidSchema,
  resourceId: uuidSchema,
});
const resourceWeeklyHoursBody = Type.Object(
  {
    days: Type.Array(
      Type.Object(
        {
          weekday: Type.Integer({ minimum: 1, maximum: 7 }),
          mode: Type.Union([
            Type.Literal("inherit"),
            Type.Literal("closed"),
            Type.Literal("custom"),
          ]),
          intervals: Type.Array(interval),
        },
        { additionalProperties: Type.Never() },
      ),
      { minItems: 7, maxItems: 7 },
    ),
  },
  { additionalProperties: Type.Never() },
);

export const availabilityRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // Validate without coercing null, booleans, or strings into minute values.
  app.setValidatorCompiler(
    ({ schema }) =>
      (value) =>
        Check(schema as TSchema, value)
          ? { value }
          : { error: new Error("Invalid request") },
  );
  app.decorateRequest("verifiedUser");
  app.addHook("preHandler", requireVerifiedUser);
  await app.register(organizationDateOverrideRoutes);

  app.get(
    "/api/organizations/:organizationId/availability/weekly-hours",
    {
      schema: { params: organizationParams },
    },
    async (request, reply) => {
      const result = await getOrganizationWeeklyHours({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(200).send(result.weeklyHours);
    },
  );

  app.put(
    "/api/organizations/:organizationId/availability/weekly-hours",
    {
      schema: { params: organizationParams, body: weeklyHoursBody },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError) {
        if (request.validationError.validationContext === "body") {
          return sendAvailabilityError(
            reply,
            request.id,
            "invalid_weekly_hours",
          );
        }
        throw request.validationError;
      }
      const result = await replaceOrganizationWeeklyHours({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
        days: request.body.days,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(200).send(result.weeklyHours);
    },
  );
  app.get(
    "/api/organizations/:organizationId/resources/:resourceId/availability/weekly-hours",
    { schema: { params: resourceParams } },
    async (request, reply) => {
      const result = await getResourceWeeklyHours({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(200).send(result.weeklyHours);
    },
  );
  app.put(
    "/api/organizations/:organizationId/resources/:resourceId/availability/weekly-hours",
    {
      schema: { params: resourceParams, body: resourceWeeklyHoursBody },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError) {
        if (request.validationError.validationContext === "body")
          return sendAvailabilityError(
            reply,
            request.id,
            "invalid_weekly_hours",
          );
        throw request.validationError;
      }
      const result = await replaceResourceWeeklyHours({
        userId: request.verifiedUser.id,
        ...request.params,
        days: request.body.days,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(200).send(result.weeklyHours);
    },
  );
};
