import { describe, expect, it } from "vitest";
import { parseBookingEventMessage } from "../../src/bookings/event-schema.js";

describe("booking event schema validation", () => {
  const validCreatedEvent = {
    eventId: "018f9d0c-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
    aggregateType: "booking",
    aggregateId: "018f9d0c-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
    eventType: "booking.created",
    occurredAt: "2026-10-05T10:00:00.000Z",
    payload: {
      bookingId: "018f9d0c-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
      organizationId: "org-1",
      publicReference: "SL-123456",
      resourceId: "res-1",
      serviceId: "srv-1",
      startAt: "2026-10-05T12:00:00.000Z",
      serviceEndAt: "2026-10-05T12:30:00.000Z",
      durationMinutes: 30,
      priceAgorot: 5000,
      source: "public",
      guestName: "Alice",
      guestPhone: "+972501234567",
      guestEmail: "alice@example.com",
    },
  };

  it("parses and validates a valid booking.created event", () => {
    const result = parseBookingEventMessage(JSON.stringify(validCreatedEvent));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe("booking.created");
    if (result.event.eventType !== "booking.created") return;
    expect(result.event.eventId).toBe(validCreatedEvent.eventId);
    expect(result.event.payload.guestEmail).toBe("alice@example.com");
  });

  it("accepts a manual event with no guest name", () => {
    const result = parseBookingEventMessage(
      JSON.stringify({
        ...validCreatedEvent,
        payload: {
          ...validCreatedEvent.payload,
          source: "manual",
          guestName: null,
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.payload).toMatchObject({
      source: "manual",
      guestName: null,
    });
  });

  it("treats a historical event without source as public", () => {
    const { source: _source, ...historicalPayload } = validCreatedEvent.payload;
    const result = parseBookingEventMessage(
      JSON.stringify({ ...validCreatedEvent, payload: historicalPayload }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.event.eventType !== "booking.created") return;
    expect(result.event.payload.source).toBe("public");
  });

  it("parses and validates a valid booking.rescheduled event", () => {
    const rescheduledEvent = {
      ...validCreatedEvent,
      eventType: "booking.rescheduled",
      payload: {
        ...validCreatedEvent.payload,
        previousResourceId: "res-old",
        previousStartAt: "2026-10-05T11:00:00.000Z",
      },
    };
    const result = parseBookingEventMessage(JSON.stringify(rescheduledEvent));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe("booking.rescheduled");
  });

  it("parses and validates a valid booking.cancelled event", () => {
    const cancelledEvent = {
      ...validCreatedEvent,
      eventType: "booking.cancelled",
      payload: {
        bookingId: validCreatedEvent.aggregateId,
        organizationId: "org-1",
        publicReference: "SL-123456",
        resourceId: "res-1",
        serviceId: "srv-1",
        startAt: "2026-10-05T12:00:00.000Z",
        guestName: "Alice",
        guestPhone: null,
        guestEmail: "alice@example.com",
        cancelledAt: "2026-10-05T11:00:00.000Z",
        cancellationReason: "Schedule conflict",
        cancelledBy: "guest" as const,
      },
    };
    const result = parseBookingEventMessage(JSON.stringify(cancelledEvent));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventType).toBe("booking.cancelled");
  });

  it("parses a minimal booking.reminder_due event without adding snapshot data", () => {
    const reminderId = "028f9d0c-1a2b-7c3d-8e4f-5a6b7c8d9e0f";
    const result = parseBookingEventMessage(
      JSON.stringify({
        ...validCreatedEvent,
        eventType: "booking.reminder_due",
        payload: {
          reminderId,
          bookingId: validCreatedEvent.aggregateId,
          scheduledForStartAt: "2026-10-05T12:00:00.000Z",
        },
      }),
    );
    expect(result).toEqual({
      ok: true,
      event: {
        eventId: validCreatedEvent.eventId,
        aggregateType: "booking",
        aggregateId: validCreatedEvent.aggregateId,
        eventType: "booking.reminder_due",
        occurredAt: validCreatedEvent.occurredAt,
        payload: {
          reminderId,
          bookingId: validCreatedEvent.aggregateId,
          scheduledForStartAt: "2026-10-05T12:00:00.000Z",
        },
      },
    });
  });

  it("rejects malformed JSON with invalid_json", () => {
    const result = parseBookingEventMessage("{invalid json");
    expect(result).toEqual({ ok: false, deadLetterReason: "invalid_json" });
  });

  it("rejects invalid envelope structure with invalid_envelope", () => {
    expect(parseBookingEventMessage(JSON.stringify({}))).toEqual({
      ok: false,
      deadLetterReason: "invalid_envelope",
    });
    expect(
      parseBookingEventMessage(
        JSON.stringify({ ...validCreatedEvent, aggregateType: "order" }),
      ),
    ).toEqual({ ok: false, deadLetterReason: "invalid_envelope" });
    expect(
      parseBookingEventMessage(
        JSON.stringify({ ...validCreatedEvent, eventId: "" }),
      ),
    ).toEqual({ ok: false, deadLetterReason: "invalid_envelope" });
  });

  it("rejects unsupported event types with unsupported_event", () => {
    const unknownEvent = {
      ...validCreatedEvent,
      eventType: "booking.noshow_marked",
    };
    expect(parseBookingEventMessage(JSON.stringify(unknownEvent))).toEqual({
      ok: false,
      deadLetterReason: "unsupported_event",
    });
  });

  it("rejects payload mismatch with invalid_payload", () => {
    const mismatchedPayload = {
      ...validCreatedEvent,
      payload: {
        ...validCreatedEvent.payload,
        bookingId: "different-id",
      },
    };
    expect(parseBookingEventMessage(JSON.stringify(mismatchedPayload))).toEqual(
      { ok: false, deadLetterReason: "invalid_payload" },
    );
  });

  it("rejects missing required payload fields with invalid_payload", () => {
    const incompletePayload = {
      ...validCreatedEvent,
      payload: {
        bookingId: validCreatedEvent.aggregateId,
        // missing organizationId, publicReference, etc.
      },
    };
    expect(parseBookingEventMessage(JSON.stringify(incompletePayload))).toEqual(
      { ok: false, deadLetterReason: "invalid_payload" },
    );
  });
});
