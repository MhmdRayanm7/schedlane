import type { Options } from "amqplib";

export type IntegrationEventMessage = {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  occurredAt: string;
  payload: unknown;
};

export type EncodedIntegrationEventMessage = {
  routingKey: string;
  content: Buffer;
  properties: Options.Publish;
};

export function encodeIntegrationEventMessage(
  event: IntegrationEventMessage,
): EncodedIntegrationEventMessage {
  const occurredAtMilliseconds = Date.parse(event.occurredAt);
  if (!Number.isFinite(occurredAtMilliseconds))
    throw new Error(`Invalid occurredAt for event ${event.eventId}`);

  return {
    routingKey: event.eventType,
    content: Buffer.from(JSON.stringify(event), "utf8"),
    properties: {
      messageId: event.eventId,
      type: event.eventType,
      contentType: "application/json",
      contentEncoding: "utf-8",
      persistent: true,
      mandatory: true,
      timestamp: Math.floor(occurredAtMilliseconds / 1000),
    },
  };
}
