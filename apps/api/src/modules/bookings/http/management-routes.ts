import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply } from "fastify";
import Type from "typebox";
import { Check } from "typebox/value";
import { requireVerifiedUser } from "../../../http/auth-guard.js";
import { uuidSchema } from "../../../http/schemas.js";
import { typeboxValidatorCompiler } from "../../../http/typebox-validator.js";
import {
  type CancelManagementBookingResult,
  cancelManagementBooking,
  type MarkManagementBookingNoShowResult,
  markManagementBookingNoShow,
  type RevertManagementBookingNoShowResult,
  revertManagementBookingNoShow,
} from "../application/lifecycle.js";
import { listManagementBookings } from "../application/list-management-bookings.js";
import {
  type RescheduleManagementBookingResult,
  rescheduleManagementBooking,
} from "../application/reschedule.js";
import {
  type GetBookingRescheduleOptionsResult,
  getBookingRescheduleOptions,
} from "../application/reschedule-options.js";

type BookingRoutesOptions = {
  now?: () => Date;
};

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
const bookingParamsSchema = Type.Object(
  {
    organizationId: uuidSchema,
    bookingId: uuidSchema,
  },
  { additionalProperties: Type.Never() },
);
const cancelBodySchema = Type.Object(
  { reason: Type.Optional(Type.Union([Type.String(), Type.Null()])) },
  { additionalProperties: Type.Never() },
);
const rescheduleBodySchema = Type.Object(
  {
    resourceId: uuidSchema,
    date: Type.String(),
    startMinute: Type.Integer({ minimum: 0, maximum: 1439 }),
  },
  { additionalProperties: Type.Never() },
);
const rescheduleOptionsQuerySchema = Type.Object(
  {
    date: Type.String(),
    resourceId: Type.Optional(uuidSchema),
  },
  { additionalProperties: Type.Never() },
);

type BookingActionResult =
  | CancelManagementBookingResult
  | MarkManagementBookingNoShowResult
  | RevertManagementBookingNoShowResult;

function sendBookingActionError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<BookingActionResult, { ok: false }>["reason"],
) {
  const errors = {
    organization_not_found: [
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    ],
    booking_not_found: [404, "BOOKING_NOT_FOUND", "Booking not found"],
    insufficient_role: [
      403,
      "INSUFFICIENT_ROLE",
      "Your organization role does not allow this Booking action",
    ],
    organization_archived: [
      409,
      "ORGANIZATION_ARCHIVED",
      "Restore the organization before making changes",
    ],
    organization_suspended: [
      409,
      "ORGANIZATION_SUSPENDED",
      "The organization is suspended and read-only",
    ],
    invalid_booking_status: [
      409,
      "INVALID_BOOKING_STATUS",
      "Booking status does not allow this action",
    ],
    no_show_too_early: [
      409,
      "NO_SHOW_TOO_EARLY",
      "Booking cannot be marked no-show before its start",
    ],
    booking_conflict: [
      409,
      "BOOKING_CONFLICT",
      "Booking occupancy conflicts with another confirmed Booking",
    ],
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

function sendBookingRescheduleError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<RescheduleManagementBookingResult, { ok: false }>["reason"],
) {
  const errors = {
    organization_not_found: [
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    ],
    booking_not_found: [404, "BOOKING_NOT_FOUND", "Booking not found"],
    resource_not_found: [404, "RESOURCE_NOT_FOUND", "Resource not found"],
    service_not_found: [404, "SERVICE_NOT_FOUND", "Service not found"],
    insufficient_role: [
      403,
      "INSUFFICIENT_ROLE",
      "Your organization role does not allow this Booking action",
    ],
    organization_archived: [
      409,
      "ORGANIZATION_ARCHIVED",
      "Restore the organization before making changes",
    ],
    organization_suspended: [
      409,
      "ORGANIZATION_SUSPENDED",
      "The organization is suspended and read-only",
    ],
    invalid_booking_status: [
      409,
      "INVALID_BOOKING_STATUS",
      "Booking status does not allow this action",
    ],
    resource_inactive: [409, "RESOURCE_INACTIVE", "Resource is inactive"],
    service_not_assigned: [
      409,
      "SERVICE_NOT_ASSIGNED",
      "Service is not assigned to this Resource",
    ],
    invalid_date: [400, "INVALID_DATE", "Date is invalid"],
    invalid_start_time: [400, "INVALID_START_TIME", "Start time is invalid"],
    reschedule_start_in_past: [
      409,
      "RESCHEDULE_START_IN_PAST",
      "Booking cannot be rescheduled into the past",
    ],
    start_not_available: [409, "SLOT_UNAVAILABLE", "Slot is unavailable"],
    booking_conflict: [409, "SLOT_UNAVAILABLE", "Slot is unavailable"],
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

function sendBookingRescheduleOptionsError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<GetBookingRescheduleOptionsResult, { ok: false }>["reason"],
) {
  const errors = {
    organization_not_found: [
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    ],
    booking_not_found: [404, "BOOKING_NOT_FOUND", "Booking not found"],
    resource_not_found: [404, "RESOURCE_NOT_FOUND", "Resource not found"],
    service_not_found: [404, "SERVICE_NOT_FOUND", "Service not found"],
    insufficient_role: [
      403,
      "INSUFFICIENT_ROLE",
      "Your organization role does not allow this Booking action",
    ],
    organization_archived: [
      409,
      "ORGANIZATION_ARCHIVED",
      "Restore the organization before making changes",
    ],
    organization_suspended: [
      409,
      "ORGANIZATION_SUSPENDED",
      "The organization is suspended and read-only",
    ],
    invalid_booking_status: [
      409,
      "INVALID_BOOKING_STATUS",
      "Booking status does not allow this action",
    ],
    resource_inactive: [409, "RESOURCE_INACTIVE", "Resource is inactive"],
    service_not_assigned: [
      409,
      "SERVICE_NOT_ASSIGNED",
      "Service is not assigned to this Resource",
    ],
    invalid_date: [400, "INVALID_DATE", "Date is invalid"],
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

export const bookingRoutes: FastifyPluginAsyncTypebox<
  BookingRoutesOptions
> = async (app, options) => {
  app.setValidatorCompiler(typeboxValidatorCompiler);
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

  app.post(
    "/api/organizations/:organizationId/bookings/:bookingId/reschedule",
    {
      schema: {
        params: bookingParamsSchema,
        body: rescheduleBodySchema,
      },
    },
    async (request, reply) => {
      const result = await rescheduleManagementBooking(
        {
          userId: request.verifiedUser.id,
          ...request.params,
          ...request.body,
        },
        options.now?.() ?? new Date(),
      );
      if (!result.ok)
        return sendBookingRescheduleError(reply, request.id, result.reason);
      return reply.code(200).send(result.booking);
    },
  );

  app.get(
    "/api/organizations/:organizationId/bookings/:bookingId/reschedule-options",
    {
      schema: {
        params: bookingParamsSchema,
        querystring: rescheduleOptionsQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await getBookingRescheduleOptions(
        {
          userId: request.verifiedUser.id,
          ...request.params,
          ...request.query,
        },
        options.now?.() ?? new Date(),
      );
      if (!result.ok)
        return sendBookingRescheduleOptionsError(
          reply,
          request.id,
          result.reason,
        );
      return reply.code(200).send(result.options);
    },
  );

  app.post(
    "/api/organizations/:organizationId/bookings/:bookingId/cancel",
    { schema: { params: bookingParamsSchema } },
    async (request, reply) => {
      if (request.body !== undefined && !Check(cancelBodySchema, request.body))
        return reply.code(400).send({
          code: "FST_ERR_VALIDATION",
          message: "Invalid request",
          requestId: request.id,
        });
      const reason = (request.body as { reason?: string | null } | undefined)
        ?.reason;
      const result = await cancelManagementBooking(
        {
          userId: request.verifiedUser.id,
          ...request.params,
          ...(reason === undefined ? {} : { reason }),
        },
        options.now?.() ?? new Date(),
      );
      if (!result.ok)
        return sendBookingActionError(reply, request.id, result.reason);
      return reply.code(200).send(result.booking);
    },
  );

  app.post(
    "/api/organizations/:organizationId/bookings/:bookingId/mark-no-show",
    { schema: { params: bookingParamsSchema } },
    async (request, reply) => {
      const result = await markManagementBookingNoShow(
        { userId: request.verifiedUser.id, ...request.params },
        options.now?.() ?? new Date(),
      );
      if (!result.ok)
        return sendBookingActionError(reply, request.id, result.reason);
      return reply.code(200).send(result.booking);
    },
  );

  app.post(
    "/api/organizations/:organizationId/bookings/:bookingId/revert-no-show",
    { schema: { params: bookingParamsSchema } },
    async (request, reply) => {
      const result = await revertManagementBookingNoShow(
        { userId: request.verifiedUser.id, ...request.params },
        options.now?.() ?? new Date(),
      );
      if (!result.ok)
        return sendBookingActionError(reply, request.id, result.reason);
      return reply.code(200).send(result.booking);
    },
  );
};
