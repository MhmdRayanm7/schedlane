import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply } from "fastify";
import Type from "typebox";
import { requireVerifiedUser } from "../../http/auth-guard.js";
import { uuidSchema } from "../../http/schemas.js";
import { sendOrganizationWriteStateError } from "../organizations/organization-http-errors.js";
import {
  assignResourceToService,
  type ResourceServiceAssignmentResult,
  unassignResourceFromService,
} from "./resource-service-assignment-service.js";
import {
  listOrganizationServices,
  listServiceResources,
} from "./service-query-service.js";
import {
  createService,
  deactivateService,
  reactivateService,
  updateService,
} from "./service-service.js";

const organizationParams = Type.Object({
  organizationId: uuidSchema,
});

const serviceParams = Type.Object({
  organizationId: uuidSchema,
  serviceId: uuidSchema,
});

const serviceResourceParams = Type.Object({
  organizationId: uuidSchema,
  serviceId: uuidSchema,
  resourceId: uuidSchema,
});

function sendAssignmentError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<ResourceServiceAssignmentResult, { ok: false }>["reason"],
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
    service_not_found: [404, "SERVICE_NOT_FOUND", "Service not found"],
    resource_not_found: [404, "RESOURCE_NOT_FOUND", "Resource not found"],
    insufficient_role: [
      403,
      "SERVICE_MANAGEMENT_NOT_ALLOWED",
      "Your organization role does not allow Service management",
    ],
    service_inactive: [409, "SERVICE_INACTIVE", "The Service is deactivated"],
    resource_inactive: [
      409,
      "RESOURCE_INACTIVE",
      "The Resource is deactivated",
    ],
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

const createServiceBody = Type.Object({
  name: Type.String({
    minLength: 1,
    maxLength: 120,
    pattern: ".*\\S.*",
  }),
  durationMinutes: Type.Integer({
    minimum: 1,
  }),
  priceAgorot: Type.Union([
    Type.Integer({
      minimum: 0,
    }),
    Type.Null(),
  ]),
  bufferAfterMinutes: Type.Optional(
    Type.Integer({
      minimum: 0,
    }),
  ),
});

const updateServiceBody = Type.Object(
  {
    name: Type.Optional(createServiceBody.properties.name),
    durationMinutes: Type.Optional(
      createServiceBody.properties.durationMinutes,
    ),
    // A single nullable type avoids coercing null to zero inside an anyOf branch.
    priceAgorot: Type.Optional(
      Type.Unsafe<number | null>({ type: ["integer", "null"], minimum: 0 }),
    ),
    bufferAfterMinutes: createServiceBody.properties.bufferAfterMinutes,
  },
  {
    minProperties: 1,
    // Reject unknown fields instead of letting Fastify strip them.
    additionalProperties: Type.Never(),
  },
);

export const serviceRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.decorateRequest("verifiedUser");
  app.addHook("preHandler", requireVerifiedUser);

  app.get(
    "/api/organizations/:organizationId/services/:serviceId/resources",
    { schema: { params: serviceParams } },
    async (request, reply) => {
      const result = await listServiceResources({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAssignmentError(reply, request.id, result.reason);
      return reply.code(200).send({ items: result.items });
    },
  );

  app.put(
    "/api/organizations/:organizationId/services/:serviceId/resources/:resourceId",
    { schema: { params: serviceResourceParams } },
    async (request, reply) => {
      const result = await assignResourceToService({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAssignmentError(reply, request.id, result.reason);
      return reply.code(200).send(result.assignment);
    },
  );

  app.delete(
    "/api/organizations/:organizationId/services/:serviceId/resources/:resourceId",
    { schema: { params: serviceResourceParams } },
    async (request, reply) => {
      const result = await unassignResourceFromService({
        userId: request.verifiedUser.id,
        ...request.params,
      });
      if (!result.ok)
        return sendAssignmentError(reply, request.id, result.reason);
      return reply.code(200).send(result.assignment);
    },
  );

  app.get(
    "/api/organizations/:organizationId/services",
    {
      schema: {
        params: organizationParams,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await listOrganizationServices({
        userId: user.id,
        organizationId: request.params.organizationId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "insufficient_role":
            return reply.code(403).send({
              code: "SERVICE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow Service management",
              requestId: request.id,
            });
        }
      }

      return reply.code(200).send({
        items: result.items,
      });
    },
  );

  app.post(
    "/api/organizations/:organizationId/services",
    {
      schema: {
        params: organizationParams,
        body: createServiceBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await createService({
        userId: user.id,
        organizationId: request.params.organizationId,
        name: request.body.name,
        durationMinutes: request.body.durationMinutes,
        priceAgorot: request.body.priceAgorot,
        bufferAfterMinutes: request.body.bufferAfterMinutes ?? 0,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "insufficient_role":
            return reply.code(403).send({
              code: "SERVICE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow Service management",
              requestId: request.id,
            });

          case "price_required":
            return reply.code(409).send({
              code: "SERVICE_PRICE_REQUIRED",
              message:
                "A price is required while organization pricing is enabled",
              requestId: request.id,
            });

          case "pricing_disabled":
            return reply.code(409).send({
              code: "ORGANIZATION_PRICING_DISABLED",
              message:
                "Enable organization pricing before setting a Service price",
              requestId: request.id,
            });

          case "organization_archived":
          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(201).send(result.service);
    },
  );

  app.patch(
    "/api/organizations/:organizationId/services/:serviceId",
    {
      schema: {
        params: serviceParams,
        body: updateServiceBody,
      },
    },
    async (request, reply) => {
      const user = request.verifiedUser;

      const result = await updateService({
        ...request.body,
        userId: user.id,
        organizationId: request.params.organizationId,
        serviceId: request.params.serviceId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "service_not_found":
            return reply.code(404).send({
              code: "SERVICE_NOT_FOUND",
              message: "Service not found",
              requestId: request.id,
            });

          case "insufficient_role":
            return reply.code(403).send({
              code: "SERVICE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow Service management",
              requestId: request.id,
            });

          case "price_required":
            return reply.code(409).send({
              code: "SERVICE_PRICE_REQUIRED",
              message:
                "A price is required while organization pricing is enabled",
              requestId: request.id,
            });

          case "pricing_disabled":
            return reply.code(409).send({
              code: "ORGANIZATION_PRICING_DISABLED",
              message:
                "Enable organization pricing before setting a Service price",
              requestId: request.id,
            });

          case "organization_archived":
          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(200).send(result.service);
    },
  );

  app.post(
    "/api/organizations/:organizationId/services/:serviceId/deactivate",
    {
      schema: {
        params: serviceParams,
      },
    },
    async (request, reply) => {
      const result = await deactivateService({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
        serviceId: request.params.serviceId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "service_not_found":
            return reply.code(404).send({
              code: "SERVICE_NOT_FOUND",
              message: "Service not found",
              requestId: request.id,
            });

          case "insufficient_role":
            return reply.code(403).send({
              code: "SERVICE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow Service management",
              requestId: request.id,
            });

          case "organization_archived":
          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(200).send(result.service);
    },
  );

  app.post(
    "/api/organizations/:organizationId/services/:serviceId/reactivate",
    {
      schema: {
        params: serviceParams,
      },
    },
    async (request, reply) => {
      const result = await reactivateService({
        userId: request.verifiedUser.id,
        organizationId: request.params.organizationId,
        serviceId: request.params.serviceId,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "organization_not_found":
            return reply.code(404).send({
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found",
              requestId: request.id,
            });

          case "service_not_found":
            return reply.code(404).send({
              code: "SERVICE_NOT_FOUND",
              message: "Service not found",
              requestId: request.id,
            });

          case "insufficient_role":
            return reply.code(403).send({
              code: "SERVICE_MANAGEMENT_NOT_ALLOWED",
              message:
                "Your organization role does not allow Service management",
              requestId: request.id,
            });

          case "organization_archived":
          case "organization_suspended":
            return sendOrganizationWriteStateError(
              reply,
              request.id,
              result.reason,
            );
        }
      }

      return reply.code(200).send(result.service);
    },
  );
};
