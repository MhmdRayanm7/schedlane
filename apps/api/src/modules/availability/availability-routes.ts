import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply } from "fastify";
import Type, { type TSchema } from "typebox";
import { Check } from "typebox/value";
import { requireVerifiedUser } from "../../http/auth-guard.js";
import { uuidSchema } from "../../http/schemas.js";
import { sendOrganizationWriteStateError } from "../organizations/organization-http-errors.js";
import { getOrganizationWeeklyHours } from "./availability-query-service.js";
import {
  type ReplaceOrganizationWeeklyHoursResult,
  replaceOrganizationWeeklyHours,
} from "./availability-service.js";

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

function sendAvailabilityError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<
    ReplaceOrganizationWeeklyHoursResult,
    { ok: false }
  >["reason"],
) {
  if (
    reason === "organization_archived" ||
    reason === "organization_suspended"
  ) {
    return sendOrganizationWriteStateError(reply, requestId, reason);
  }
  const errors = {
    organization_not_found: [
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    ],
    insufficient_role: [
      403,
      "AVAILABILITY_MANAGEMENT_NOT_ALLOWED",
      "Your organization role does not allow Availability management",
    ],
    invalid_weekly_hours: [
      400,
      "INVALID_WEEKLY_HOURS",
      "Weekly hours contain invalid or overlapping intervals",
    ],
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

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
};
