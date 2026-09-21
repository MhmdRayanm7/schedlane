import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sendOrganizationWriteStateError } from "../../organizations/http/errors.js";
import { createService, updateService } from "../application/create-update.js";
import {
  deactivateService,
  reactivateService,
} from "../application/lifecycle.js";
import { listOrganizationServices } from "../application/queries.js";
import {
  createServiceBody,
  organizationParams,
  serviceParams,
  updateServiceBody,
} from "./schemas.js";

export const catalogRoutes: FastifyPluginAsyncTypebox = async (app) => {
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
