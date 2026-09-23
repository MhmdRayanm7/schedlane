import { Pool } from "pg";
import { runBookingConsumer } from "./bookings/consumer.js";
import { config } from "./config.js";
import { RabbitMqOutboxPublisher } from "./messaging/rabbitmq-publisher.js";
import { runOutboxDispatcher } from "./outbox/dispatcher.js";

const pool = new Pool({ connectionString: config.DATABASE_URL });
const shutdown = new AbortController();

function requestShutdown(signal: NodeJS.Signals) {
  if (shutdown.signal.aborted) return;
  console.log("Worker shutdown requested", { signal });
  shutdown.abort();
}

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);

try {
  await Promise.all([
    runOutboxDispatcher({
      pool,
      connectPublisher: () =>
        RabbitMqOutboxPublisher.connect(config.RABBITMQ_URL),
      batchSize: config.OUTBOX_BATCH_SIZE,
      pollIntervalMs: config.OUTBOX_POLL_INTERVAL_MS,
      reconnectDelayMs: config.RABBITMQ_RECONNECT_DELAY_MS,
      signal: shutdown.signal,
    }),
    runBookingConsumer({
      url: config.RABBITMQ_URL,
      handler: async () => {},
      prefetch: config.BOOKING_EVENT_PREFETCH,
      retryDelayMs: config.BOOKING_EVENT_RETRY_DELAY_MS,
      maxAttempts: config.BOOKING_EVENT_MAX_ATTEMPTS,
      reconnectDelayMs: config.RABBITMQ_RECONNECT_DELAY_MS,
      signal: shutdown.signal,
    }),
  ]);
} finally {
  await pool.end();
}
