import type { ConfirmedBooking } from "../persistence/confirmed-booking-write.js";

export const bookingEventType = {
  created: "booking.created",
  rescheduled: "booking.rescheduled",
  cancelled: "booking.cancelled",
} as const;

export type BookingCreatedEventPayload = {
  bookingId: string;
  organizationId: string;
  publicReference: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  serviceEndAt: string;
  durationMinutes: number;
  priceAgorot: number | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
};

export type BookingRescheduledEventPayload = BookingCreatedEventPayload & {
  previousResourceId: string;
  previousStartAt: string;
};

export type BookingCancelledEventPayload = {
  bookingId: string;
  organizationId: string;
  publicReference: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  cancelledAt: string;
  cancellationReason: string | null;
  cancelledBy: "management" | "guest";
};

export function createBookingCreatedEventPayload(
  booking: ConfirmedBooking,
): BookingCreatedEventPayload {
  return {
    bookingId: booking.id,
    organizationId: booking.organizationId,
    publicReference: booking.publicReference,
    resourceId: booking.resourceId,
    serviceId: booking.serviceId,
    startAt: booking.startAt,
    serviceEndAt: booking.serviceEndAt,
    durationMinutes: booking.durationMinutes,
    priceAgorot: booking.priceAgorot,
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    guestEmail: booking.guestEmail,
  };
}

type RescheduledBookingSnapshot = {
  id: string;
  organizationId: string;
  publicReference: string;
  previousResourceId: string;
  resourceId: string;
  serviceId: string;
  previousStartAt: Date;
  startAt: Date;
  serviceEndAt: Date;
  durationMinutes: number;
  priceAgorot: number | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
};

export function createBookingRescheduledEventPayload(
  booking: RescheduledBookingSnapshot,
): BookingRescheduledEventPayload {
  return {
    bookingId: booking.id,
    organizationId: booking.organizationId,
    publicReference: booking.publicReference,
    serviceId: booking.serviceId,
    previousResourceId: booking.previousResourceId,
    resourceId: booking.resourceId,
    previousStartAt: booking.previousStartAt.toISOString(),
    startAt: booking.startAt.toISOString(),
    serviceEndAt: booking.serviceEndAt.toISOString(),
    durationMinutes: booking.durationMinutes,
    priceAgorot: booking.priceAgorot,
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    guestEmail: booking.guestEmail,
  };
}

type CancelledBookingSnapshot = {
  id: string;
  organizationId: string;
  publicReference: string;
  resourceId: string;
  serviceId: string;
  startAt: Date;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  cancelledAt: Date;
  cancellationReason: string | null;
  cancelledBy: "management" | "guest";
};

export function createBookingCancelledEventPayload(
  booking: CancelledBookingSnapshot,
): BookingCancelledEventPayload {
  return {
    bookingId: booking.id,
    organizationId: booking.organizationId,
    publicReference: booking.publicReference,
    resourceId: booking.resourceId,
    serviceId: booking.serviceId,
    startAt: booking.startAt.toISOString(),
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    guestEmail: booking.guestEmail,
    cancelledAt: booking.cancelledAt.toISOString(),
    cancellationReason: booking.cancellationReason,
    cancelledBy: booking.cancelledBy,
  };
}
