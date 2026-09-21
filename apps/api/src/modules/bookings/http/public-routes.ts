import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply } from "fastify";
import Type, { type TSchema } from "typebox";
import { Check } from "typebox/value";
import { uuidSchema } from "../../../http/schemas.js";
import {
  type CreatePublicBookingResult,
  createPublicBooking,
} from "../application/create-public-booking.js";
import { getGuestManagedBooking } from "../application/guest/read.js";
import {
  type CancelGuestManagedBookingResult,
  cancelGuestManagedBooking,
  type UpdateGuestManagedBookingContactResult,
  updateGuestManagedBookingContact,
} from "../application/guest/write.js";
import { parseGuestManagementBearer } from "./guest-authorization.js";

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
const guestCancelBodySchema = Type.Object(
  { reason: Type.Optional(Type.Union([Type.String(), Type.Null()])) },
  { additionalProperties: Type.Never() },
);
const guestContactBodySchema = Type.Object(
  {
    guestName: Type.Optional(Type.String()),
    guestPhone: Type.Optional(Type.String()),
    guestEmail: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { minProperties: 1, additionalProperties: Type.Never() },
);

function sendGuestBookingNotFound(reply: FastifyReply, requestId: string) {
  return reply.code(404).send({
    code: "GUEST_BOOKING_NOT_FOUND",
    message: "Guest Booking not found",
    requestId,
  });
}

function sendGuestCancellationError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<CancelGuestManagedBookingResult, { ok: false }>["reason"],
) {
  if (reason === "guest_booking_not_found")
    return sendGuestBookingNotFound(reply, requestId);
  const errors = {
    invalid_booking_status: [
      409,
      "INVALID_BOOKING_STATUS",
      "Booking status does not allow cancellation",
    ],
    cancellation_cutoff_passed: [
      409,
      "CANCELLATION_CUTOFF_PASSED",
      "The Booking cancellation deadline has passed",
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
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

function sendGuestContactError(
  reply: FastifyReply,
  requestId: string,
  reason: Extract<
    UpdateGuestManagedBookingContactResult,
    { ok: false }
  >["reason"],
) {
  if (reason === "guest_booking_not_found")
    return sendGuestBookingNotFound(reply, requestId);
  const errors = {
    invalid_guest_name: [400, "INVALID_GUEST_NAME", "Guest name is required"],
    invalid_guest_phone: [400, "INVALID_GUEST_PHONE", "Guest phone is invalid"],
    invalid_booking_status: [
      409,
      "INVALID_BOOKING_STATUS",
      "Booking status does not allow contact editing",
    ],
    guest_contact_edit_closed: [
      409,
      "GUEST_CONTACT_EDIT_CLOSED",
      "Guest contact editing is closed",
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
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}

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

  app.get("/api/public/bookings/manage", async (request, reply) => {
    const token = parseGuestManagementBearer(request.headers.authorization);
    if (!token) return sendGuestBookingNotFound(reply, request.id);
    const result = await getGuestManagedBooking(
      token,
      options.now?.() ?? new Date(),
    );
    if (!result.ok) return sendGuestBookingNotFound(reply, request.id);
    return reply.code(200).send(result.booking);
  });

  app.patch("/api/public/bookings/manage/contact", async (request, reply) => {
    const token = parseGuestManagementBearer(request.headers.authorization);
    if (!token) return sendGuestBookingNotFound(reply, request.id);
    if (!Check(guestContactBodySchema, request.body))
      return reply.code(400).send({
        code: "FST_ERR_VALIDATION",
        message: "Invalid request",
        requestId: request.id,
      });
    const result = await updateGuestManagedBookingContact(
      { token, ...request.body },
      options.now?.() ?? new Date(),
    );
    if (!result.ok)
      return sendGuestContactError(reply, request.id, result.reason);
    return reply.code(200).send(result.booking);
  });

  app.post("/api/public/bookings/manage/cancel", {}, async (request, reply) => {
    const token = parseGuestManagementBearer(request.headers.authorization);
    if (!token) return sendGuestBookingNotFound(reply, request.id);
    if (
      request.body !== undefined &&
      !Check(guestCancelBodySchema, request.body)
    )
      return reply.code(400).send({
        code: "FST_ERR_VALIDATION",
        message: "Invalid request",
        requestId: request.id,
      });
    const result = await cancelGuestManagedBooking(
      {
        token,
        ...((request.body as { reason?: string | null } | undefined) ?? {}),
      },
      options.now?.() ?? new Date(),
    );
    if (!result.ok)
      return sendGuestCancellationError(reply, request.id, result.reason);
    return reply.code(200).send(result.booking);
  });
};
