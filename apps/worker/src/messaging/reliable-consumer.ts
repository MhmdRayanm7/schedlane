import type {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
  Options,
} from "amqplib";
import { connect } from "amqplib";
import {
  assertEventTopology,
  DEAD_LETTER_EXCHANGE,
  RETRY_EXCHANGE,
} from "./topology.js";

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

type ParseResult<TEvent> =
  | { ok: true; event: TEvent }
  | { ok: false; deadLetterReason: string };

export type ReliableConsumerOptions<TEvent> = {
  url: string;
  queue: string;
  fallbackRoutingKey: string;
  parser: (content: Buffer) => ParseResult<TEvent>;
  handler: (event: TEvent) => Promise<void>;
  prefetch?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
  signal: AbortSignal;
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
    channel.publish(exchange, routingKey, content, properties, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export class RabbitMqReliableConsumer<TEvent> {
  private readonly inFlight = new Set<Promise<void>>();
  private closePromise: Promise<void> | undefined;
  private readonly closedPromise: Promise<void>;
  private notifyClosed!: () => void;
  private consumerTag: string | undefined;

  private constructor(
    private readonly connection: ChannelModel,
    private readonly channel: ConfirmChannel,
    private readonly options: ReliableConsumerOptions<TEvent>,
    private readonly maxAttempts: number,
  ) {
    this.closedPromise = new Promise((resolve) => {
      this.notifyClosed = resolve;
    });
    connection.once("close", () => this.notifyClosed());
    channel.once("close", () => this.notifyClosed());
  }

  static async connect<TEvent>(
    options: ReliableConsumerOptions<TEvent>,
  ): Promise<RabbitMqReliableConsumer<TEvent>> {
    const connection = await connect(options.url);
    try {
      const channel = await connection.createConfirmChannel();
      try {
        await assertEventTopology(channel, {
          retryDelayMs: options.retryDelayMs ?? 5000,
        });
        await channel.prefetch(options.prefetch ?? 5);
        const consumer = new RabbitMqReliableConsumer(
          connection,
          channel,
          options,
          options.maxAttempts ?? 5,
        );
        const { consumerTag } = await channel.consume(
          options.queue,
          (message) => {
            if (!message) return;
            const task = consumer.handleDelivery(message).finally(() => {
              consumer.inFlight.delete(task);
            });
            consumer.inFlight.add(task);
          },
          { noAck: false },
        );
        consumer.consumerTag = consumerTag;

        const onAbort = () => {
          options.signal.removeEventListener("abort", onAbort);
          consumer.close().catch(() => undefined);
        };
        if (options.signal.aborted) onAbort();
        else options.signal.addEventListener("abort", onAbort, { once: true });
        return consumer;
      } catch (error) {
        await channel.close().catch(() => undefined);
        throw error;
      }
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private retryCount(message: ConsumeMessage): number {
    const value = message.properties.headers?.["x-schedlane-retry-count"];
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : 0;
  }

  private async republish(
    message: ConsumeMessage,
    exchange: string,
    retryCount: number,
    deadLetterReason?: string,
  ) {
    const headers = {
      ...(message.properties.headers ?? {}),
      "x-schedlane-retry-count": retryCount,
      ...(deadLetterReason
        ? { "x-schedlane-dead-letter-reason": deadLetterReason }
        : {}),
    };
    await publishConfirmed(
      this.channel,
      exchange,
      message.fields.routingKey || this.options.fallbackRoutingKey,
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

  private async handleDelivery(message: ConsumeMessage) {
    const retryCount = this.retryCount(message);
    const parsed = this.options.parser(message.content);
    if (!parsed.ok) {
      try {
        await this.republish(
          message,
          DEAD_LETTER_EXCHANGE,
          retryCount,
          parsed.deadLetterReason,
        );
      } catch (error) {
        console.error(
          "Failed to republish invalid message to DLQ",
          safeErrorMetadata(error),
        );
      }
      return;
    }

    try {
      await this.options.handler(parsed.event);
      this.channel.ack(message);
    } catch (error) {
      if (error instanceof PermanentEventError) {
        try {
          await this.republish(
            message,
            DEAD_LETTER_EXCHANGE,
            retryCount,
            error.deadLetterReason,
          );
        } catch (publishError) {
          console.error(
            "Failed to republish permanent error to DLQ",
            safeErrorMetadata(publishError),
          );
        }
        return;
      }

      try {
        if (retryCount + 1 < this.maxAttempts) {
          await this.republish(message, RETRY_EXCHANGE, retryCount + 1);
        } else {
          await this.republish(
            message,
            DEAD_LETTER_EXCHANGE,
            retryCount + 1,
            "max_attempts_exceeded",
          );
        }
      } catch (publishError) {
        console.error(
          "Failed to republish failed message",
          safeErrorMetadata(publishError),
        );
      }
    }
  }

  waitUntilClosed(): Promise<void> {
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

export async function runReliableConsumer<TEvent>(
  options: ReliableConsumerOptions<TEvent> & {
    label: string;
    reconnectDelayMs: number;
  },
) {
  while (!options.signal.aborted) {
    let consumer: RabbitMqReliableConsumer<TEvent> | undefined;
    try {
      consumer = await RabbitMqReliableConsumer.connect(options);
      console.log(`RabbitMQ ${options.label} consumer established`);
      await consumer.waitUntilClosed();
    } catch (error) {
      if (!options.signal.aborted) {
        console.error(
          `${options.label} consumer retrying`,
          safeErrorMetadata(error),
        );
      }
    } finally {
      await consumer?.close().catch(() => undefined);
    }

    if (!options.signal.aborted) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(finish, options.reconnectDelayMs);
        function finish() {
          clearTimeout(timeout);
          options.signal.removeEventListener("abort", finish);
          resolve();
        }
        options.signal.addEventListener("abort", finish, { once: true });
      });
    }
  }
}
