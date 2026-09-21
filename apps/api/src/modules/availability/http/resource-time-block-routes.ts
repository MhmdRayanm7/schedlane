import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  createResourceTimeBlock,
  deleteResourceTimeBlock,
  listResourceTimeBlocks,
} from "../application/resource-time-blocks.js";
import { sendAvailabilityError } from "./errors.js";
import {
  minuteIntervalSchema,
  resourceAvailabilityDateParamsSchema,
  resourceTimeBlockParamsSchema,
} from "./schemas.js";

const body = minuteIntervalSchema;

export const resourceTimeBlockRoutes: FastifyPluginAsyncTypebox = async (
  app,
) => {
  app.get(
    "/api/organizations/:organizationId/resources/:resourceId/availability/time-blocks/:date",
    { schema: { params: resourceAvailabilityDateParamsSchema } },
    async (request, reply) => {
      const result = await listResourceTimeBlocks({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(200).send(result.timeBlocks);
    },
  );
  app.post(
    "/api/organizations/:organizationId/resources/:resourceId/availability/time-blocks/:date",
    {
      schema: { params: resourceAvailabilityDateParamsSchema, body },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError) {
        if (request.validationError.validationContext === "body")
          return sendAvailabilityError(reply, request.id, "invalid_time_block");
        throw request.validationError;
      }
      const result = await createResourceTimeBlock({
        userId: request.verifiedUser.id,
        ...request.params,
        ...request.body,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(201).send(result.timeBlock);
    },
  );
  app.delete(
    "/api/organizations/:organizationId/resources/:resourceId/availability/time-blocks/:timeBlockId",
    { schema: { params: resourceTimeBlockParamsSchema } },
    async (request, reply) => {
      const result = await deleteResourceTimeBlock({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAvailabilityError(reply, request.id, result.reason);
      return reply.code(204).send();
    },
  );
};
