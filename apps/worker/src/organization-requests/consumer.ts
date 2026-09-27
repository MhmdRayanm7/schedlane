import {
  RabbitMqReliableConsumer,
  runReliableConsumer,
} from "../messaging/reliable-consumer.js";
import { ORGANIZATION_REQUEST_EVENTS_QUEUE } from "../messaging/topology.js";
import {
  parseOrganizationRequestEventMessage,
  type ValidatedOrganizationRequestEvent,
} from "./event-schema.js";

export type OrganizationRequestEventHandler = (
  event: ValidatedOrganizationRequestEvent,
) => Promise<void>;

export type OrganizationRequestConsumerOptions = {
  url: string;
  handler: OrganizationRequestEventHandler;
  prefetch?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
  signal: AbortSignal;
};

export const RabbitMqOrganizationRequestConsumer = {
  connect(options: OrganizationRequestConsumerOptions) {
    return RabbitMqReliableConsumer.connect({
      ...options,
      queue: ORGANIZATION_REQUEST_EVENTS_QUEUE,
      fallbackRoutingKey: "organization_request.unknown",
      parser: parseOrganizationRequestEventMessage,
    });
  },
};

export function runOrganizationRequestConsumer(
  options: Required<Omit<OrganizationRequestConsumerOptions, "signal">> & {
    signal: AbortSignal;
    reconnectDelayMs: number;
  },
) {
  return runReliableConsumer({
    ...options,
    queue: ORGANIZATION_REQUEST_EVENTS_QUEUE,
    fallbackRoutingKey: "organization_request.unknown",
    parser: parseOrganizationRequestEventMessage,
    label: "organization request",
  });
}
