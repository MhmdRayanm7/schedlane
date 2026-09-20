import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply } from "fastify";
import Type, { type TSchema } from "typebox";
import { Check } from "typebox/value";
import { uuidSchema } from "../../http/schemas.js";
import {
  type CreatePublicBookingResult,
  createPublicBooking,
} from "./public-booking-service.js";

type PublicBookingRoutesOptions = {
  now?: () => Date;
};

const paramsSchema = Type.Object(
  { slug: Type.String() },
  { additionalProperties: Type.Never() },
);
const bodySchema = Type.Object(
  {
    resourceId: uuidSchema,
    serviceId: uuidSchema,
    date: Type.String(),
    startMinute: Type.Integer({ minimum: 0, maximum: 1439 }),
    guestName: Type.String(),
    guestPhone: Type.String(),
    guestEmail: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    customerNote: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: Type.Never() },
);

function sendPublicBookingError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<CreatePublicBookingResult, { ok: false }>["reason"],
) {
  const errors = {
    invalid_date: [
      400,
      "INVALID_DATE",
      "Date must be a valid YYYY-MM-DD calendar date",
    ],
    invalid_start_time: [400, "INVALID_START_TIME", "Start time is invalid"],
    invalid_guest_name: [400, "INVALID_GUEST_NAME", "Guest name is required"],
    invalid_guest_phone: [
      400,
      "INVALID_GUEST_PHONE",
      "Guest phone is required",
    ],
    date_outside_booking_window: [
      400,
      "DATE_OUTSIDE_BOOKING_WINDOW",
      "Date is outside the public booking window",
    ],
    public_booking_not_found: [
      404,
      "PUBLIC_BOOKING_NOT_FOUND",
      "Public booking option not found",
    ],
    slot_unavailable: [409, "SLOT_UNAVAILABLE", "Slot is unavailable"],
    booking_conflict: [409, "SLOT_UNAVAILABLE", "Slot is unavailable"],
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

export const publicBookingRoutes: FastifyPluginAsyncTypebox<
  PublicBookingRoutesOptions
> = async (app, options) => {
  app.setValidatorCompiler(
    ({ schema }) =>
      (value) =>
        Check(schema as TSchema, value)
          ? { value }
          : { error: new Error("Invalid request") },
  );

  app.post(
    "/api/public/organizations/:slug/bookings",
    { schema: { params: paramsSchema, body: bodySchema } },
    async (request, reply) => {
      const result = await createPublicBooking(
        {
          organizationSlug: request.params.slug,
          ...request.body,
        },
        options.now?.() ?? new Date(),
      );
      if (!result.ok)
        return sendPublicBookingError(reply, request.id, result.reason);
      return reply.code(201).send({
        publicReference: result.booking.publicReference,
        status: result.booking.status,
        resourceId: result.booking.resourceId,
        serviceId: result.booking.serviceId,
        startAt: result.booking.startAt,
        priceAgorot: result.booking.priceAgorot,
        managementToken: result.managementToken,
      });
    },
  );
};
