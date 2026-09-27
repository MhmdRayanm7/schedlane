import {
  RabbitMqReliableConsumer,
  runReliableConsumer,
} from "../messaging/reliable-consumer.js";
import { PUBLICATION_EVENTS_QUEUE } from "../messaging/topology.js";
import {
  parsePublicationEventMessage,
  type ValidatedPublicationEvent,
} from "./event-schema.js";

export type PublicationEventHandler = (
  event: ValidatedPublicationEvent,
) => Promise<void>;

export type PublicationConsumerOptions = {
  url: string;
  handler: PublicationEventHandler;
  prefetch?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
  signal: AbortSignal;
};

export const RabbitMqPublicationConsumer = {
  connect(options: PublicationConsumerOptions) {
    return RabbitMqReliableConsumer.connect({
      ...options,
      queue: PUBLICATION_EVENTS_QUEUE,
      fallbackRoutingKey: "organization.unknown",
      parser: parsePublicationEventMessage,
    });
  },
};

export function runPublicationConsumer(
  options: Required<Omit<PublicationConsumerOptions, "signal">> & {
    signal: AbortSignal;
    reconnectDelayMs: number;
  },
) {
  return runReliableConsumer({
    ...options,
    queue: PUBLICATION_EVENTS_QUEUE,
    fallbackRoutingKey: "organization.unknown",
    parser: parsePublicationEventMessage,
    label: "organization publication",
  });
}
