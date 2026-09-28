import { Pool } from "pg";
import { runBookingConsumer } from "./bookings/consumer.js";
import { ConsoleTransactionalEmailService } from "./bookings/email/console-email-service.js";
import type { TransactionalEmailService } from "./bookings/email/email-service.js";
import { createBookingEmailHandler } from "./bookings/email/handler.js";
import { ResendTransactionalEmailService } from "./bookings/email/resend-email-service.js";
import { runBookingReminderScheduler } from "./bookings/reminders/scheduler.js";
import { config } from "./config.js";
import { RabbitMqOutboxPublisher } from "./messaging/rabbitmq-publisher.js";
import { runOrganizationRequestConsumer } from "./organization-requests/consumer.js";
import { createOrganizationRequestEmailHandler } from "./organization-requests/email/handler.js";
import { runOutboxDispatcher } from "./outbox/dispatcher.js";
import { runPublicationConsumer } from "./publication/consumer.js";
import { createPublicationEmailHandler } from "./publication/email/handler.js";

const pool = new Pool({ connectionString: config.DATABASE_URL });
const shutdown = new AbortController();
const eventRetryDelayMs =
  config.EVENT_RETRY_DELAY_MS ?? config.BOOKING_EVENT_RETRY_DELAY_MS ?? 5000;

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
  appBaseUrl: config.APP_BASE_URL,
});

const organizationRequestEventHandler = createOrganizationRequestEmailHandler({
  pool,
  emailService,
  platformNotificationEmail: config.PLATFORM_NOTIFICATION_EMAIL,
  appBaseUrl: config.APP_BASE_URL,
  supportEmail: config.SUPPORT_EMAIL,
});

const publicationEventHandler = createPublicationEmailHandler({
  pool,
  emailService,
  platformNotificationEmail: config.PLATFORM_NOTIFICATION_EMAIL,
  appBaseUrl: config.APP_BASE_URL,
  supportEmail: config.SUPPORT_EMAIL,
});

try {
  await Promise.all([
    runBookingReminderScheduler({
      pool,
      batchSize: config.BOOKING_REMINDER_BATCH_SIZE,
      pollIntervalMs: config.BOOKING_REMINDER_POLL_INTERVAL_MS,
      signal: shutdown.signal,
    }),
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
      retryDelayMs: eventRetryDelayMs,
      maxAttempts: config.BOOKING_EVENT_MAX_ATTEMPTS,
      reconnectDelayMs: config.RABBITMQ_RECONNECT_DELAY_MS,
      signal: shutdown.signal,
    }),
    runOrganizationRequestConsumer({
      url: config.RABBITMQ_URL,
      handler: organizationRequestEventHandler,
      prefetch: config.ORGANIZATION_REQUEST_EVENT_PREFETCH,
      retryDelayMs: eventRetryDelayMs,
      maxAttempts: config.ORGANIZATION_REQUEST_EVENT_MAX_ATTEMPTS,
      reconnectDelayMs: config.RABBITMQ_RECONNECT_DELAY_MS,
      signal: shutdown.signal,
    }),
    runPublicationConsumer({
      url: config.RABBITMQ_URL,
      handler: publicationEventHandler,
      prefetch: config.PUBLICATION_EVENT_PREFETCH,
      retryDelayMs: eventRetryDelayMs,
      maxAttempts: config.PUBLICATION_EVENT_MAX_ATTEMPTS,
      reconnectDelayMs: config.RABBITMQ_RECONNECT_DELAY_MS,
      signal: shutdown.signal,
    }),
  ]);
} finally {
  await pool.end();
}
