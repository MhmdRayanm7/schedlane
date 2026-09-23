import type {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
  Options,
} from "amqplib";
import { connect } from "amqplib";
import {
  assertEventTopology,
  BOOKING_EVENTS_QUEUE,
  DEAD_LETTER_EXCHANGE,
  RETRY_EXCHANGE,
} from "../messaging/topology.js";
import {
  type ParseBookingEventResult,
  parseBookingEventMessage,
  type ValidatedBookingEvent,
} from "./event-schema.js";

export class PermanentEventError extends Error {
  readonly isPermanent = true;
  constructor(
    readonly deadLetterReason: string,
    message?: string,
  ) {
    super(message ?? deadLetterReason);
    this.name = "PermanentEventError";
  }
}

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

export type ClosableBookingConsumer = {
  close(): Promise<void>;
  waitUntilClosed(): Promise<void>;
};

function safeErrorMetadata(error: unknown) {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const code = "code" in error ? error.code : undefined;
  return {
    name: error.name,
    ...(typeof code === "string" ? { code } : {}),
  };
}

function publishConfirmed(
  channel: ConfirmChannel,
  exchange: string,
  routingKey: string,
  content: Buffer,
  properties: Options.Publish,
): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.publish(exchange, routingKey, content, properties, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function waitForDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, milliseconds);
    function finish() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}

export class RabbitMqBookingConsumer implements ClosableBookingConsumer {
  private readonly inFlight = new Set<Promise<void>>();
  private closePromise: Promise<void> | undefined;
  private readonly closedPromise: Promise<void>;
  private notifyClosed!: () => void;
  private consumerTag: string | undefined;

  private constructor(
    private readonly connection: ChannelModel,
    private readonly channel: ConfirmChannel,
    private readonly handler: BookingEventHandler,
    private readonly maxAttempts: number,
  ) {
    this.closedPromise = new Promise((resolve) => {
      this.notifyClosed = resolve;
    });

    connection.once("close", () => {
      this.notifyClosed();
    });

    channel.once("close", () => {
      this.notifyClosed();
    });
  }

  static async connect(
    options: RabbitMqBookingConsumerOptions,
  ): Promise<RabbitMqBookingConsumer> {
    const prefetch = options.prefetch ?? 5;
    const retryDelayMs = options.retryDelayMs ?? 5000;
    const maxAttempts = options.maxAttempts ?? 5;

    const connection = await connect(options.url);
    try {
      const channel = await connection.createConfirmChannel();
      try {
        await assertEventTopology(channel, { retryDelayMs });
        await channel.prefetch(prefetch);

        const consumerInstance = new RabbitMqBookingConsumer(
          connection,
          channel,
          options.handler,
          maxAttempts,
        );

        const { consumerTag } = await channel.consume(
          BOOKING_EVENTS_QUEUE,
          (message) => {
            if (!message) return;
            const task = consumerInstance
              .handleDelivery(message)
              .finally(() => {
                consumerInstance.inFlight.delete(task);
              });
            consumerInstance.inFlight.add(task);
          },
          { noAck: false },
        );

        consumerInstance.consumerTag = consumerTag;

        const onAbort = () => {
          options.signal.removeEventListener("abort", onAbort);
          consumerInstance.close().catch(() => undefined);
        };

        if (options.signal.aborted) {
          onAbort();
        } else {
          options.signal.addEventListener("abort", onAbort, { once: true });
        }

        return consumerInstance;
      } catch (error) {
        await channel.close().catch(() => undefined);
        throw error;
      }
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private extractRetryCount(message: ConsumeMessage): number {
    const raw = message.properties.headers?.["x-schedlane-retry-count"];
    if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
      return raw;
    }
    return 0;
  }

  private async republishToDeadLetter(
    message: ConsumeMessage,
    retryCount: number,
    deadLetterReason: string,
  ): Promise<void> {
    const routingKey = message.fields.routingKey || "booking.unknown";
    const headers = {
      ...(message.properties.headers ?? {}),
      "x-schedlane-retry-count": retryCount,
      "x-schedlane-dead-letter-reason": deadLetterReason,
    };

    await publishConfirmed(
      this.channel,
      DEAD_LETTER_EXCHANGE,
      routingKey,
      message.content,
      {
        messageId: message.properties.messageId,
        type: message.properties.type,
        contentType: message.properties.contentType ?? "application/json",
        contentEncoding: message.properties.contentEncoding ?? "utf-8",
        persistent: true,
        headers,
      },
    );

    this.channel.ack(message);
  }

  private async republishToRetry(
    message: ConsumeMessage,
    retryCount: number,
  ): Promise<void> {
    const routingKey = message.fields.routingKey;
    const headers = {
      ...(message.properties.headers ?? {}),
      "x-schedlane-retry-count": retryCount + 1,
    };

    await publishConfirmed(
      this.channel,
      RETRY_EXCHANGE,
      routingKey,
      message.content,
      {
        messageId: message.properties.messageId,
        type: message.properties.type,
        contentType: message.properties.contentType ?? "application/json",
        contentEncoding: message.properties.contentEncoding ?? "utf-8",
        persistent: true,
        headers,
      },
    );

    this.channel.ack(message);
  }

  private async handleDelivery(message: ConsumeMessage): Promise<void> {
    const retryCount = this.extractRetryCount(message);
    const parsed: ParseBookingEventResult = parseBookingEventMessage(
      message.content,
    );

    if (!parsed.ok) {
      try {
        await this.republishToDeadLetter(
          message,
          retryCount,
          parsed.deadLetterReason,
        );
      } catch (err) {
        console.error(
          "Failed to republish invalid message to DLQ",
          safeErrorMetadata(err),
        );
      }
      return;
    }

    try {
      await this.handler(parsed.event);
      this.channel.ack(message);
    } catch (error) {
      if (error instanceof PermanentEventError) {
        try {
          await this.republishToDeadLetter(
            message,
            retryCount,
            error.deadLetterReason,
          );
        } catch (dlqError) {
          console.error(
            "Failed to republish permanent error to DLQ",
            safeErrorMetadata(dlqError),
          );
        }
        return;
      }

      if (retryCount + 1 < this.maxAttempts) {
        try {
          await this.republishToRetry(message, retryCount);
        } catch (retryError) {
          console.error(
            "Failed to republish message to retry queue",
            safeErrorMetadata(retryError),
          );
        }
      } else {
        try {
          await this.republishToDeadLetter(
            message,
            retryCount + 1,
            "max_attempts_exceeded",
          );
        } catch (dlqError) {
          console.error(
            "Failed to republish max-attempt message to DLQ",
            safeErrorMetadata(dlqError),
          );
        }
      }
    }
  }

  async waitUntilClosed(): Promise<void> {
    return this.closedPromise;
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = (async () => {
      if (this.consumerTag) {
        await this.channel.cancel(this.consumerTag).catch(() => undefined);
      }
      await Promise.allSettled([...this.inFlight]);
      await this.channel.close().catch(() => undefined);
      await this.connection.close().catch(() => undefined);
      this.notifyClosed();
    })();
    return this.closePromise;
  }
}

export type RunBookingConsumerOptions = {
  url: string;
  handler: BookingEventHandler;
  prefetch: number;
  retryDelayMs: number;
  maxAttempts: number;
  reconnectDelayMs: number;
  signal: AbortSignal;
};

export async function runBookingConsumer({
  url,
  handler,
  prefetch,
  retryDelayMs,
  maxAttempts,
  reconnectDelayMs,
  signal,
}: RunBookingConsumerOptions): Promise<void> {
  while (!signal.aborted) {
    let consumer: ClosableBookingConsumer | undefined;
    try {
      consumer = await RabbitMqBookingConsumer.connect({
        url,
        handler,
        prefetch,
        retryDelayMs,
        maxAttempts,
        signal,
      });
      console.log("RabbitMQ booking consumer established");
      await consumer.waitUntilClosed();
    } catch (error) {
      if (!signal.aborted) {
        console.error("Booking consumer retrying", safeErrorMetadata(error));
      }
    } finally {
      if (consumer) await consumer.close().catch(() => undefined);
    }

    if (!signal.aborted) await waitForDelay(reconnectDelayMs, signal);
  }
}
