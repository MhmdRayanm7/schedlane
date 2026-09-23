import type { Pool } from "pg";
import type { OutboxPublisher } from "../messaging/rabbitmq-publisher.js";
import { dispatchOutboxBatch } from "./postgres-outbox.js";

export type ClosableOutboxPublisher = OutboxPublisher & {
  close(): Promise<void>;
};

type RunOutboxDispatcherInput = {
  pool: Pool;
  connectPublisher: () => Promise<ClosableOutboxPublisher>;
  batchSize: number;
  pollIntervalMs: number;
  reconnectDelayMs: number;
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

export async function runOutboxDispatcher({
  pool,
  connectPublisher,
  batchSize,
  pollIntervalMs,
  reconnectDelayMs,
  signal,
}: RunOutboxDispatcherInput): Promise<void> {
  while (!signal.aborted) {
    let publisher: ClosableOutboxPublisher | undefined;
    try {
      publisher = await connectPublisher();
      console.log("RabbitMQ connection established");

      while (!signal.aborted) {
        const count = await dispatchOutboxBatch({
          pool,
          publisher,
          batchSize,
        });
        if (count > 0) console.log("Outbox batch dispatched", { count });
        if (count < batchSize) await waitForDelay(pollIntervalMs, signal);
      }
    } catch (error) {
      console.error("Outbox dispatcher retrying", safeErrorMetadata(error));
    } finally {
      if (publisher) await publisher.close();
    }

    if (!signal.aborted) await waitForDelay(reconnectDelayMs, signal);
  }
}
