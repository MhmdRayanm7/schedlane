import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PermanentEventError,
  RabbitMqBookingConsumer,
} from "../../src/bookings/consumer.js";
import {
  BOOKING_EVENTS_DLQ,
  BOOKING_EVENTS_QUEUE,
  BOOKING_EVENTS_RETRY_QUEUE,
  EVENTS_EXCHANGE,
} from "../../src/messaging/topology.js";
import { startWorkerTestInfrastructure } from "../helpers/test-infrastructure.js";

const infra = await startWorkerTestInfrastructure();
beforeEach(() => infra.reset());
afterAll(() => infra.stop());

describe("reliable booking event consumer", () => {
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
      guestName: "Alice",
      guestPhone: "+972501234567",
      guestEmail: "alice@example.com",
    },
  };

  it("consumes a valid booking event and acknowledges it on handler success", async () => {
    let handledEvent: unknown;
    const shutdown = new AbortController();

    const consumer = await RabbitMqBookingConsumer.connect({
      url: infra.rabbitmqUrl,
      handler: async (event) => {
        handledEvent = event;
      },
      signal: shutdown.signal,
    });

    try {
      infra.rabbitChannel?.publish(
        EVENTS_EXCHANGE,
        "booking.created",
        Buffer.from(JSON.stringify(validCreatedEvent), "utf8"),
        {
          messageId: validCreatedEvent.eventId,
          type: "booking.created",
          contentType: "application/json",
          persistent: true,
        },
      );

      await expect
        .poll(() => handledEvent, { timeout: 5000, interval: 50 })
        .toMatchObject({
          eventId: validCreatedEvent.eventId,
          eventType: "booking.created",
        });

      // Queue should be empty after ACK
      await expect
        .poll(
          async () =>
            (await infra.rabbitChannel?.checkQueue(BOOKING_EVENTS_QUEUE))
              ?.messageCount,
          { timeout: 5000, interval: 50 },
        )
        .toBe(0);
    } finally {
      shutdown.abort();
      await consumer.close();
    }
  });

  it("routes transient handler failures through retry exchange with incremented retry header", async () => {
    let attempts = 0;
    const shutdown = new AbortController();

    const consumer = await RabbitMqBookingConsumer.connect({
      url: infra.rabbitmqUrl,
      maxAttempts: 3,
      handler: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Temporary network error");
        }
      },
      signal: shutdown.signal,
    });

    try {
      infra.rabbitChannel?.publish(
        EVENTS_EXCHANGE,
        "booking.created",
        Buffer.from(JSON.stringify(validCreatedEvent), "utf8"),
        {
          messageId: validCreatedEvent.eventId,
          type: "booking.created",
          contentType: "application/json",
          persistent: true,
        },
      );

      // Should retry and succeed on attempt 2 after 5s TTL
      await expect
        .poll(() => attempts, { timeout: 12000, interval: 100 })
        .toBe(2);

      // Confirm main and retry queues are empty
      await expect
        .poll(
          async () =>
            (await infra.rabbitChannel?.checkQueue(BOOKING_EVENTS_QUEUE))
              ?.messageCount,
          { timeout: 5000, interval: 50 },
        )
        .toBe(0);
      await expect
        .poll(
          async () =>
            (await infra.rabbitChannel?.checkQueue(BOOKING_EVENTS_RETRY_QUEUE))
              ?.messageCount,
          { timeout: 5000, interval: 50 },
        )
        .toBe(0);
    } finally {
      shutdown.abort();
      await consumer.close();
    }
  }, 15000);

  it("republishes to DLQ after reaching max attempts with safe headers", async () => {
    let attempts = 0;
    const shutdown = new AbortController();

    const consumer = await RabbitMqBookingConsumer.connect({
      url: infra.rabbitmqUrl,
      maxAttempts: 2,
      handler: async () => {
        attempts += 1;
        throw new Error("Persistent database failure");
      },
      signal: shutdown.signal,
    });

    try {
      infra.rabbitChannel?.publish(
        EVENTS_EXCHANGE,
        "booking.created",
        Buffer.from(JSON.stringify(validCreatedEvent), "utf8"),
        {
          messageId: validCreatedEvent.eventId,
          type: "booking.created",
          contentType: "application/json",
          persistent: true,
        },
      );

      await expect
        .poll(() => attempts, { timeout: 12000, interval: 100 })
        .toBe(2);

      // Message should now be in DLQ
      await expect
        .poll(
          async () =>
            (await infra.rabbitChannel?.checkQueue(BOOKING_EVENTS_DLQ))
              ?.messageCount,
          { timeout: 5000, interval: 50 },
        )
        .toBe(1);

      const dlqMessage = await infra.rabbitChannel?.get(BOOKING_EVENTS_DLQ);
      expect(dlqMessage).toBeTruthy();
      if (dlqMessage) {
        expect(dlqMessage.properties.messageId).toBe(validCreatedEvent.eventId);
        expect(
          dlqMessage.properties.headers?.["x-schedlane-dead-letter-reason"],
        ).toBe("max_attempts_exceeded");
        expect(dlqMessage.properties.headers?.["x-schedlane-retry-count"]).toBe(
          2,
        );
        expect(dlqMessage.content.toString("utf8")).toBe(
          JSON.stringify(validCreatedEvent),
        );
      }
    } finally {
      shutdown.abort();
      await consumer.close();
    }
  }, 15000);

  it("immediately routes malformed JSON to DLQ without retrying", async () => {
    let handlerCalled = false;
    const shutdown = new AbortController();

    const consumer = await RabbitMqBookingConsumer.connect({
      url: infra.rabbitmqUrl,
      handler: async () => {
        handlerCalled = true;
      },
      signal: shutdown.signal,
    });

    try {
      infra.rabbitChannel?.publish(
        EVENTS_EXCHANGE,
        "booking.created",
        Buffer.from("{bad-json", "utf8"),
        {
          messageId: "msg-bad-json",
          type: "booking.created",
          contentType: "application/json",
          persistent: true,
        },
      );

      await expect
        .poll(
          async () =>
            (await infra.rabbitChannel?.checkQueue(BOOKING_EVENTS_DLQ))
              ?.messageCount,
          { timeout: 5000, interval: 50 },
        )
        .toBe(1);

      expect(handlerCalled).toBe(false);

      const dlqMessage = await infra.rabbitChannel?.get(BOOKING_EVENTS_DLQ);
      expect(dlqMessage).toBeTruthy();
      if (dlqMessage) {
        expect(
          dlqMessage.properties.headers?.["x-schedlane-dead-letter-reason"],
        ).toBe("invalid_json");
        expect(dlqMessage.content.toString("utf8")).toBe("{bad-json");
      }
    } finally {
      shutdown.abort();
      await consumer.close();
    }
  });

  it("immediately routes unsupported booking event to DLQ", async () => {
    let handlerCalled = false;
    const shutdown = new AbortController();

    const consumer = await RabbitMqBookingConsumer.connect({
      url: infra.rabbitmqUrl,
      handler: async () => {
        handlerCalled = true;
      },
      signal: shutdown.signal,
    });

    const unknownEvent = {
      ...validCreatedEvent,
      eventType: "booking.future_unsupported",
    };

    try {
      infra.rabbitChannel?.publish(
        EVENTS_EXCHANGE,
        "booking.future_unsupported",
        Buffer.from(JSON.stringify(unknownEvent), "utf8"),
        {
          messageId: unknownEvent.eventId,
          type: unknownEvent.eventType,
          contentType: "application/json",
          persistent: true,
        },
      );

      await expect
        .poll(
          async () =>
            (await infra.rabbitChannel?.checkQueue(BOOKING_EVENTS_DLQ))
              ?.messageCount,
          { timeout: 5000, interval: 50 },
        )
        .toBe(1);

      expect(handlerCalled).toBe(false);

      const dlqMessage = await infra.rabbitChannel?.get(BOOKING_EVENTS_DLQ);
      expect(dlqMessage).toBeTruthy();
      if (dlqMessage) {
        expect(
          dlqMessage.properties.headers?.["x-schedlane-dead-letter-reason"],
        ).toBe("unsupported_event");
      }
    } finally {
      shutdown.abort();
      await consumer.close();
    }
  });

  it("routes permanent handler failures directly to DLQ", async () => {
    let attempts = 0;
    const shutdown = new AbortController();

    const consumer = await RabbitMqBookingConsumer.connect({
      url: infra.rabbitmqUrl,
      maxAttempts: 5,
      handler: async () => {
        attempts += 1;
        throw new PermanentEventError("booking_not_found");
      },
      signal: shutdown.signal,
    });

    try {
      infra.rabbitChannel?.publish(
        EVENTS_EXCHANGE,
        "booking.created",
        Buffer.from(JSON.stringify(validCreatedEvent), "utf8"),
        {
          messageId: validCreatedEvent.eventId,
          type: "booking.created",
          contentType: "application/json",
          persistent: true,
        },
      );

      await expect
        .poll(
          async () =>
            (await infra.rabbitChannel?.checkQueue(BOOKING_EVENTS_DLQ))
              ?.messageCount,
          { timeout: 5000, interval: 50 },
        )
        .toBe(1);

      expect(attempts).toBe(1);

      const dlqMessage = await infra.rabbitChannel?.get(BOOKING_EVENTS_DLQ);
      expect(dlqMessage).toBeTruthy();
      if (dlqMessage) {
        expect(
          dlqMessage.properties.headers?.["x-schedlane-dead-letter-reason"],
        ).toBe("booking_not_found");
      }
    } finally {
      shutdown.abort();
      await consumer.close();
    }
  });
});
