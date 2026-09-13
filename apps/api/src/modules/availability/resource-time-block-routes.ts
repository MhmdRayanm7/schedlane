import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { uuidSchema } from "../../http/schemas.js";
import { sendAvailabilityError } from "./availability-http-errors.js";
import {
  createResourceTimeBlock,
  deleteResourceTimeBlock,
  listResourceTimeBlocks,
} from "./resource-time-block-service.js";

const dateParams = Type.Object({
  organizationId: uuidSchema,
  resourceId: uuidSchema,
  date: Type.String(),
});
const deleteParams = Type.Object({
  organizationId: uuidSchema,
  resourceId: uuidSchema,
  timeBlockId: uuidSchema,
});
const body = Type.Object(
  {
    startMinute: Type.Integer({ minimum: 0, maximum: 1439 }),
    endMinute: Type.Integer({ minimum: 1, maximum: 1440 }),
  },
  { additionalProperties: Type.Never() },
);

export const resourceTimeBlockRoutes: FastifyPluginAsyncTypebox = async (
  app,
) => {
  app.get(
    "/api/organizations/:organizationId/resources/:resourceId/availability/time-blocks/:date",
    { schema: { params: dateParams } },
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
    { schema: { params: dateParams, body }, attachValidation: true },
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
    { schema: { params: deleteParams } },
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
