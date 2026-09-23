import { describe, expect, it } from "vitest";
import { encodeIntegrationEventMessage } from "../../src/messaging/event-message.js";

describe("integration event transport encoding", () => {
  it("encodes the stable envelope and durable mandatory AMQP properties", () => {
    const event = {
      eventId: "018f305e-3b4a-7c6d-8e9f-0123456789ab",
      aggregateType: "booking",
      aggregateId: "018f305e-3b4a-7c6d-8e9f-0123456789ac",
      eventType: "booking.created",
      occurredAt: "2026-09-23T12:34:56.789Z",
      payload: { bookingId: "booking-id", guestEmail: "guest@example.test" },
    };

    const encoded = encodeIntegrationEventMessage(event);

    expect(encoded.routingKey).toBe("booking.created");
    expect(JSON.parse(encoded.content.toString("utf8"))).toEqual(event);
    expect(encoded.properties).toEqual({
      messageId: event.eventId,
      type: event.eventType,
      contentType: "application/json",
      contentEncoding: "utf-8",
      persistent: true,
      mandatory: true,
      timestamp: Math.floor(Date.parse(event.occurredAt) / 1000),
    });
  });

  it("rejects an invalid event occurrence timestamp", () => {
    expect(() =>
      encodeIntegrationEventMessage({
        eventId: "event-id",
        aggregateType: "booking",
        aggregateId: "booking-id",
        eventType: "booking.created",
        occurredAt: "not-an-instant",
        payload: {},
      }),
    ).toThrow("Invalid occurredAt for event event-id");
  });
});
