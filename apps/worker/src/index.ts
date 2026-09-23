import { Pool } from "pg";
import { runBookingConsumer } from "./bookings/consumer.js";
import { ConsoleTransactionalEmailService } from "./bookings/email/console-email-service.js";
import type { TransactionalEmailService } from "./bookings/email/email-service.js";
import { createBookingEmailHandler } from "./bookings/email/handler.js";
import { ResendTransactionalEmailService } from "./bookings/email/resend-email-service.js";
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

let emailService: TransactionalEmailService;
if (config.EMAIL_PROVIDER === "resend") {
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER is resend",
    );
  }
  emailService = new ResendTransactionalEmailService({
    apiKey: config.RESEND_API_KEY,
    from: config.EMAIL_FROM,
  });
} else {
  emailService = new ConsoleTransactionalEmailService();
}

const bookingEventHandler = createBookingEmailHandler({
  pool,
  emailService,
  encryptionKey: config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY,
  guestBookingManagementUrl: config.GUEST_BOOKING_MANAGEMENT_URL,
});

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
      handler: bookingEventHandler,
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
