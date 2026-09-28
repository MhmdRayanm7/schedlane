export type ValidatedBookingCreatedPayload = {
  bookingId: string;
  organizationId: string;
  publicReference: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  serviceEndAt: string;
  durationMinutes: number;
  priceAgorot: number | null;
  source?: "public" | "manual";
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
};

export type ValidatedBookingRescheduledPayload =
  ValidatedBookingCreatedPayload & {
    previousResourceId: string;
    previousStartAt: string;
  };

export type ValidatedBookingCancelledPayload = {
  bookingId: string;
  organizationId: string;
  publicReference: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  source?: "public" | "manual";
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  cancelledAt: string;
  cancellationReason: string | null;
  cancelledBy: "management" | "guest";
};

export type ValidatedBookingReminderDuePayload = {
  reminderId: string;
  bookingId: string;
  scheduledForStartAt: string;
};

export type ValidatedBookingCreatedEvent = {
  eventId: string;
  aggregateType: "booking";
  aggregateId: string;
  eventType: "booking.created";
  occurredAt: string;
  payload: ValidatedBookingCreatedPayload;
};

export type ValidatedBookingRescheduledEvent = {
  eventId: string;
  aggregateType: "booking";
  aggregateId: string;
  eventType: "booking.rescheduled";
  occurredAt: string;
  payload: ValidatedBookingRescheduledPayload;
};

export type ValidatedBookingCancelledEvent = {
  eventId: string;
  aggregateType: "booking";
  aggregateId: string;
  eventType: "booking.cancelled";
  occurredAt: string;
  payload: ValidatedBookingCancelledPayload;
};

export type ValidatedBookingReminderDueEvent = {
  eventId: string;
  aggregateType: "booking";
  aggregateId: string;
  eventType: "booking.reminder_due";
  occurredAt: string;
  payload: ValidatedBookingReminderDuePayload;
};

export type ValidatedBookingEvent =
  | ValidatedBookingCreatedEvent
  | ValidatedBookingRescheduledEvent
  | ValidatedBookingCancelledEvent
  | ValidatedBookingReminderDueEvent;

export type ParseBookingEventResult =
  | { ok: true; event: ValidatedBookingEvent }
  | { ok: false; deadLetterReason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isBookingSource(value: unknown): value is "public" | "manual" {
  return value === "public" || value === "manual";
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validateCreatedPayload(
  payload: Record<string, unknown>,
  aggregateId: string,
): payload is ValidatedBookingCreatedPayload {
  if (payload.bookingId !== aggregateId) return false;
  if (!isNonEmptyString(payload.organizationId)) return false;
  if (!isNonEmptyString(payload.publicReference)) return false;
  if (!isNonEmptyString(payload.resourceId)) return false;
  if (!isNonEmptyString(payload.serviceId)) return false;
  if (!isValidIsoDate(payload.startAt)) return false;
  if (!isValidIsoDate(payload.serviceEndAt)) return false;
  if (!isPositiveInteger(payload.durationMinutes)) return false;
  if (!isNullableNonNegativeInteger(payload.priceAgorot)) return false;
  if (!isBookingSource(payload.source)) return false;
  if (!isNullableNonEmptyString(payload.guestName)) return false;
  if (!isNullableString(payload.guestPhone)) return false;
  if (!isNullableString(payload.guestEmail)) return false;
  return true;
}

function validateRescheduledPayload(
  payload: Record<string, unknown>,
  aggregateId: string,
): payload is ValidatedBookingRescheduledPayload {
  const raw = payload as Record<string, unknown>;
  if (!isNonEmptyString(raw.previousResourceId)) return false;
  if (!isValidIsoDate(raw.previousStartAt)) return false;
  if (!validateCreatedPayload(payload, aggregateId)) return false;
  return true;
}

function validateCancelledPayload(
  payload: Record<string, unknown>,
  aggregateId: string,
): payload is ValidatedBookingCancelledPayload {
  if (payload.bookingId !== aggregateId) return false;
  if (!isNonEmptyString(payload.organizationId)) return false;
  if (!isNonEmptyString(payload.publicReference)) return false;
  if (!isNonEmptyString(payload.resourceId)) return false;
  if (!isNonEmptyString(payload.serviceId)) return false;
  if (!isValidIsoDate(payload.startAt)) return false;
  if (!isBookingSource(payload.source)) return false;
  if (!isNullableNonEmptyString(payload.guestName)) return false;
  if (!isNullableString(payload.guestPhone)) return false;
  if (!isNullableString(payload.guestEmail)) return false;
  if (!isValidIsoDate(payload.cancelledAt)) return false;
  if (!isNullableString(payload.cancellationReason)) return false;
  if (payload.cancelledBy !== "management" && payload.cancelledBy !== "guest")
    return false;
  return true;
}

function validateReminderDuePayload(
  payload: Record<string, unknown>,
  aggregateId: string,
): payload is ValidatedBookingReminderDuePayload {
  return (
    payload.bookingId === aggregateId &&
    isNonEmptyString(payload.reminderId) &&
    isValidIsoDate(payload.scheduledForStartAt)
  );
}

export function parseBookingEventMessage(
  rawContent: Buffer | string,
): ParseBookingEventResult {
  let parsed: unknown;
  try {
    const text =
      typeof rawContent === "string" ? rawContent : rawContent.toString("utf8");
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, deadLetterReason: "invalid_json" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, deadLetterReason: "invalid_envelope" };
  }

  const record = parsed as Record<string, unknown>;

  if (
    !isNonEmptyString(record.eventId) ||
    record.aggregateType !== "booking" ||
    !isNonEmptyString(record.aggregateId) ||
    typeof record.eventType !== "string" ||
    !isValidIsoDate(record.occurredAt) ||
    typeof record.payload !== "object" ||
    record.payload === null ||
    Array.isArray(record.payload)
  ) {
    return { ok: false, deadLetterReason: "invalid_envelope" };
  }

  const rawPayload = record.payload as Record<string, unknown>;
  const bookingSnapshotPayload = {
    ...rawPayload,
    source: rawPayload.source ?? "public",
  };
  const eventId = record.eventId;
  const aggregateId = record.aggregateId;
  const occurredAt = record.occurredAt;

  switch (record.eventType) {
    case "booking.created": {
      if (!validateCreatedPayload(bookingSnapshotPayload, aggregateId)) {
        return { ok: false, deadLetterReason: "invalid_payload" };
      }
      return {
        ok: true,
        event: {
          eventId,
          aggregateType: "booking",
          aggregateId,
          eventType: "booking.created",
          occurredAt,
          payload: bookingSnapshotPayload,
        },
      };
    }
    case "booking.rescheduled": {
      if (!validateRescheduledPayload(bookingSnapshotPayload, aggregateId)) {
        return { ok: false, deadLetterReason: "invalid_payload" };
      }
      return {
        ok: true,
        event: {
          eventId,
          aggregateType: "booking",
          aggregateId,
          eventType: "booking.rescheduled",
          occurredAt,
          payload: bookingSnapshotPayload,
        },
      };
    }
    case "booking.cancelled": {
      if (!validateCancelledPayload(bookingSnapshotPayload, aggregateId)) {
        return { ok: false, deadLetterReason: "invalid_payload" };
      }
      return {
        ok: true,
        event: {
          eventId,
          aggregateType: "booking",
          aggregateId,
          eventType: "booking.cancelled",
          occurredAt,
          payload: bookingSnapshotPayload,
        },
      };
    }
    case "booking.reminder_due": {
      if (!validateReminderDuePayload(rawPayload, aggregateId)) {
        return { ok: false, deadLetterReason: "invalid_payload" };
      }
      return {
        ok: true,
        event: {
          eventId,
          aggregateType: "booking",
          aggregateId,
          eventType: "booking.reminder_due",
          occurredAt,
          payload: rawPayload,
        },
      };
    }
    default:
      return { ok: false, deadLetterReason: "unsupported_event" };
  }
}
