import type { Channel } from "amqplib";

export const EVENTS_EXCHANGE = "schedlane.events";
export const RETRY_EXCHANGE = "schedlane.events.retry";
export const DEAD_LETTER_EXCHANGE = "schedlane.events.dead";
export const EVENTS_EXCHANGE_TYPE = "topic";

export const BOOKING_EVENTS_QUEUE = "schedlane.booking.events";
export const BOOKING_EVENTS_RETRY_QUEUE = "schedlane.booking.events.retry";
export const BOOKING_EVENTS_DLQ = "schedlane.booking.events.dlq";
export const BOOKING_EVENTS_ROUTING_PATTERN = "booking.#";

export type AssertTopologyOptions = {
  retryDelayMs?: number;
};

export async function assertEventTopology(
  channel: Channel,
  options: AssertTopologyOptions = {},
): Promise<void> {
  const retryDelayMs = options.retryDelayMs ?? 5000;

  await channel.assertExchange(EVENTS_EXCHANGE, EVENTS_EXCHANGE_TYPE, {
    durable: true,
  });
  await channel.assertExchange(RETRY_EXCHANGE, EVENTS_EXCHANGE_TYPE, {
    durable: true,
  });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, EVENTS_EXCHANGE_TYPE, {
    durable: true,
  });

  await channel.assertQueue(BOOKING_EVENTS_QUEUE, { durable: true });
  await channel.bindQueue(
    BOOKING_EVENTS_QUEUE,
    EVENTS_EXCHANGE,
    BOOKING_EVENTS_ROUTING_PATTERN,
  );

  await channel.assertQueue(BOOKING_EVENTS_RETRY_QUEUE, {
    durable: true,
    arguments: {
      "x-message-ttl": retryDelayMs,
      "x-dead-letter-exchange": EVENTS_EXCHANGE,
    },
  });
  await channel.bindQueue(
    BOOKING_EVENTS_RETRY_QUEUE,
    RETRY_EXCHANGE,
    BOOKING_EVENTS_ROUTING_PATTERN,
  );

  await channel.assertQueue(BOOKING_EVENTS_DLQ, { durable: true });
  await channel.bindQueue(
    BOOKING_EVENTS_DLQ,
    DEAD_LETTER_EXCHANGE,
    BOOKING_EVENTS_ROUTING_PATTERN,
  );
}
