import {
  PermanentEventError,
  RabbitMqReliableConsumer,
  runReliableConsumer,
} from "../messaging/reliable-consumer.js";
import { BOOKING_EVENTS_QUEUE } from "../messaging/topology.js";
import {
  parseBookingEventMessage,
  type ValidatedBookingEvent,
} from "./event-schema.js";

export { PermanentEventError };
export type BookingEventHandler = (
  event: ValidatedBookingEvent,
) => Promise<void>;

export type RabbitMqBookingConsumerOptions = {
  url: string;
  handler: BookingEventHandler;
  prefetch?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
  signal: AbortSignal;
};

export const RabbitMqBookingConsumer = {
  connect(options: RabbitMqBookingConsumerOptions) {
    return RabbitMqReliableConsumer.connect({
      ...options,
      queue: BOOKING_EVENTS_QUEUE,
      fallbackRoutingKey: "booking.unknown",
      parser: parseBookingEventMessage,
    });
  },
};

export type RunBookingConsumerOptions = Required<
  Omit<RabbitMqBookingConsumerOptions, "signal">
> & { signal: AbortSignal; reconnectDelayMs: number };

export function runBookingConsumer(options: RunBookingConsumerOptions) {
  return runReliableConsumer({
    ...options,
    queue: BOOKING_EVENTS_QUEUE,
    fallbackRoutingKey: "booking.unknown",
    parser: parseBookingEventMessage,
    label: "booking",
  });
}
