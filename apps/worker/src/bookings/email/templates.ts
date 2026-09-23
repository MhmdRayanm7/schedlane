import type { ValidatedBookingEvent } from "../event-schema.js";
import { formatJerusalemDateTime } from "./date-format.js";

export interface RenderedEmail {
  to: string;
  subject: string;
  text: string;
}

export function renderBookingCreatedEmail(
  event: Extract<ValidatedBookingEvent, { eventType: "booking.created" }>,
  managementUrl?: string | null,
): RenderedEmail {
  const { guestName, guestEmail, publicReference, startAt, priceAgorot } =
    event.payload;

  if (!guestEmail) {
    throw new Error("Cannot render email without guest email");
  }

  const formattedDateTime = formatJerusalemDateTime(startAt);

  const lines = [
    `Hi ${guestName},`,
    "",
    "Your booking has been confirmed.",
    "",
    `Reference: ${publicReference}`,
    `Appointment: ${formattedDateTime} (Asia/Jerusalem)`,
  ];

  if (priceAgorot !== null && priceAgorot !== undefined) {
    const ils = (priceAgorot / 100).toFixed(2);
    lines.push(`Price: ₪${ils}`);
  }

  if (managementUrl) {
    lines.push("", "Manage booking:", managementUrl);
  }

  lines.push("", "Thank you for booking with us.");

  return {
    to: guestEmail,
    subject: `Booking confirmed — ${publicReference}`,
    text: lines.join("\n"),
  };
}

export function renderBookingRescheduledEmail(
  event: Extract<ValidatedBookingEvent, { eventType: "booking.rescheduled" }>,
  managementUrl?: string | null,
): RenderedEmail {
  const {
    guestName,
    guestEmail,
    publicReference,
    previousStartAt,
    startAt,
    priceAgorot,
  } = event.payload;

  if (!guestEmail) {
    throw new Error("Cannot render email without guest email");
  }

  const formattedPrevious = formatJerusalemDateTime(previousStartAt);
  const formattedNew = formatJerusalemDateTime(startAt);

  const lines = [
    `Hi ${guestName},`,
    "",
    "Your booking has been rescheduled.",
    "",
    `Reference: ${publicReference}`,
    `Previous Appointment: ${formattedPrevious} (Asia/Jerusalem)`,
    `New Appointment: ${formattedNew} (Asia/Jerusalem)`,
  ];

  if (priceAgorot !== null && priceAgorot !== undefined) {
    const ils = (priceAgorot / 100).toFixed(2);
    lines.push(`Price: ₪${ils}`);
  }

  if (managementUrl) {
    lines.push("", "Manage booking:", managementUrl);
  }

  lines.push("", "Thank you for booking with us.");

  return {
    to: guestEmail,
    subject: `Booking rescheduled — ${publicReference}`,
    text: lines.join("\n"),
  };
}

export function renderBookingCancelledEmail(
  event: Extract<ValidatedBookingEvent, { eventType: "booking.cancelled" }>,
  managementUrl?: string | null,
): RenderedEmail {
  const {
    guestName,
    guestEmail,
    publicReference,
    startAt,
    cancellationReason,
  } = event.payload;

  if (!guestEmail) {
    throw new Error("Cannot render email without guest email");
  }

  const formattedDateTime = formatJerusalemDateTime(startAt);

  const lines = [
    `Hi ${guestName},`,
    "",
    "Your booking has been cancelled.",
    "",
    `Reference: ${publicReference}`,
    `Scheduled Appointment: ${formattedDateTime} (Asia/Jerusalem)`,
  ];

  if (cancellationReason) {
    lines.push(`Cancellation reason: ${cancellationReason}`);
  }

  if (managementUrl) {
    lines.push("", "Manage booking:", managementUrl);
  }

  lines.push("", "Thank you.");

  return {
    to: guestEmail,
    subject: `Booking cancelled — ${publicReference}`,
    text: lines.join("\n"),
  };
}
