import type { ChannelModel, ConfirmChannel, Message } from "amqplib";
import { connect } from "amqplib";
import {
  encodeIntegrationEventMessage,
  type IntegrationEventMessage,
} from "./event-message.js";
import { assertEventTopology, EVENTS_EXCHANGE } from "./topology.js";

export interface OutboxPublisher {
  publishBatch(events: readonly IntegrationEventMessage[]): Promise<void>;
}

function waitForDrain(channel: ConfirmChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      channel.off("drain", onDrain);
      channel.off("close", onClose);
      channel.off("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error("RabbitMQ channel closed while waiting for drain"));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    channel.once("drain", onDrain);
    channel.once("close", onClose);
    channel.once("error", onError);
  });
}

export class RabbitMqOutboxPublisher implements OutboxPublisher {
  private readonly returnedEventIds = new Set<string>();
  private publishing = false;
  private closed = false;
  private closePromise: Promise<void> | undefined;

  private constructor(
    private readonly connection: ChannelModel,
    private readonly channel: ConfirmChannel,
  ) {
    channel.on("return", (message: Message) => {
      if (typeof message.properties.messageId === "string")
        this.returnedEventIds.add(message.properties.messageId);
    });
    channel.once("close", () => {
      this.closed = true;
    });
    connection.once("close", () => {
      this.closed = true;
    });
  }

  static async connect(url: string): Promise<RabbitMqOutboxPublisher> {
    const connection = await connect(url);
    try {
      const channel = await connection.createConfirmChannel();
      try {
        await assertEventTopology(channel);
        return new RabbitMqOutboxPublisher(connection, channel);
      } catch (error) {
        await channel.close().catch(() => undefined);
        throw error;
      }
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  async publishBatch(
    events: readonly IntegrationEventMessage[],
  ): Promise<void> {
    if (events.length === 0) return;
    if (this.closed) throw new Error("RabbitMQ publisher is closed");
    if (this.publishing)
      throw new Error("Concurrent RabbitMQ publish batches are not supported");

    this.publishing = true;
    const currentEventIds = new Set(events.map((event) => event.eventId));
    for (const eventId of currentEventIds)
      this.returnedEventIds.delete(eventId);

    try {
      for (const event of events) {
        const encoded = encodeIntegrationEventMessage(event);
        const writable = this.channel.publish(
          EVENTS_EXCHANGE,
          encoded.routingKey,
          encoded.content,
          encoded.properties,
        );
        if (!writable) await waitForDrain(this.channel);
      }

      await this.channel.waitForConfirms();
      const returnedEventIds = [...currentEventIds].filter((eventId) =>
        this.returnedEventIds.has(eventId),
      );
      if (returnedEventIds.length > 0)
        throw new Error(
          `RabbitMQ returned ${returnedEventIds.length} unroutable event(s)`,
        );
    } finally {
      for (const eventId of currentEventIds)
        this.returnedEventIds.delete(eventId);
      this.publishing = false;
    }
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = (async () => {
      await this.channel.close().catch(() => undefined);
      await this.connection.close().catch(() => undefined);
    })();
    return this.closePromise;
  }
}
