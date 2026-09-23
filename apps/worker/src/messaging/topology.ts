import type { Channel } from "amqplib";

export const EVENTS_EXCHANGE = "schedlane.events";
export const EVENTS_EXCHANGE_TYPE = "topic";
export const BOOKING_EVENTS_QUEUE = "schedlane.booking.events";
export const BOOKING_EVENTS_ROUTING_PATTERN = "booking.#";

export async function assertEventTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(EVENTS_EXCHANGE, EVENTS_EXCHANGE_TYPE, {
    durable: true,
  });
  await channel.assertQueue(BOOKING_EVENTS_QUEUE, { durable: true });
  await channel.bindQueue(
    BOOKING_EVENTS_QUEUE,
    EVENTS_EXCHANGE,
    BOOKING_EVENTS_ROUTING_PATTERN,
  );
}
