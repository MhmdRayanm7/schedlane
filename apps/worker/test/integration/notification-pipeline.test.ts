import { randomUUID } from "node:crypto";
import type { Message } from "amqplib";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runBookingConsumer } from "../../src/bookings/consumer.js";
import type {
  SendTransactionalEmailInput,
  SendTransactionalEmailResult,
  TransactionalEmailService,
} from "../../src/bookings/email/email-service.js";
import { createBookingEmailHandler } from "../../src/bookings/email/handler.js";
import { RabbitMqOutboxPublisher } from "../../src/messaging/rabbitmq-publisher.js";
import {
  BOOKING_EVENTS_DLQ,
  BOOKING_EVENTS_QUEUE,
  EVENTS_EXCHANGE,
} from "../../src/messaging/topology.js";
import { runOutboxDispatcher } from "../../src/outbox/dispatcher.js";
import { startWorkerTestInfrastructure } from "../helpers/test-infrastructure.js";

class MockTransactionalEmailService implements TransactionalEmailService {
  public sent: SendTransactionalEmailInput[] = [];
  public failureCountBeforeSuccess = 0;
  public alwaysFail = false;
  private attempts = 0;

  async send(
    input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult> {
    this.attempts += 1;
    if (this.alwaysFail) {
      throw new Error("Simulated email service permanent outage");
    }
    if (this.attempts <= this.failureCountBeforeSuccess) {
      throw new Error("Simulated email service transient outage");
    }
    this.sent.push(input);
    return { id: `mock-${this.sent.length}` };
  }
}

const infra = await startWorkerTestInfrastructure();
beforeEach(() => infra.reset());
afterAll(() => infra.stop());

describe("Booking Notification Pipeline End-to-End Reliability", () => {
  const encryptionKey = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="; // 32 bytes base64
  const managementBaseUrl = "http://localhost:5173/booking/manage";
  const encryptedTokenEnvelope =
    "v1.MTIzNDU2Nzg5MDEy.EsNME9uHVP4D5L7hWNKvnyR0v1e0pO6wZoCukCc5Cb0wuK8nNUJa4AgE4Q.9bez_B22t0eCpU8sWX40LQ";
  const rawToken = "0123456789012345678901234567890123456789012";

  async function seedOrganizationAndService(orgId: string, serviceId: string) {
    await infra.pool.query(
      `INSERT INTO organization (id, name, slug, timezone)
       VALUES ($1, 'Acme Clinic', $2, 'Asia/Jerusalem')`,
      [orgId, `org-${orgId}`],
    );
    await infra.pool.query(
      `INSERT INTO service (id, organization_id, name, slug, duration_minutes, price_agorot)
       VALUES ($1, $2, 'Consultation', $3, 30, 25000)`,
      [serviceId, orgId, `service-${serviceId}`],
    );
  }

  async function seedBooking(options: {
    id: string;
    orgId: string;
    serviceId: string;
    encryptedToken?: string | null | undefined;
    guestEmail?: string | null | undefined;
    guestName?: string | undefined;
  }) {
    const {
      id,
      orgId,
      serviceId,
      encryptedToken = null,
      guestEmail = "guest@example.com",
      guestName = "Jane Doe",
    } = options;

    await infra.pool.query(
      `INSERT INTO booking (
        id, organization_id, service_id, public_reference,
        status, start_at, end_at, guest_name, guest_email, guest_phone,
        guest_management_token_hash, guest_management_token_encrypted
      ) VALUES ($1, $2, $3, $4, 'confirmed', '2026-06-15T10:00:00Z', '2026-06-15T10:30:00Z', $5, $6, '+972500000000', $7, $8)`,
      [
        id,
        orgId,
        serviceId,
        `SL-${id.slice(0, 8)}`,
        guestName,
        guestEmail,
        encryptedToken ? "fake-hash" : null,
        encryptedToken,
      ],
    );
  }

  async function insertOutboxEvent(event: {
    id: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  }) {
    await infra.pool.query(
      `INSERT INTO outbox_event (id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.id,
        event.aggregateType,
        event.aggregateId,
        event.eventType,
        JSON.stringify(event.payload),
        event.occurredAt,
      ],
    );
  }

  it("dispatches booking.created outbox event and sends transactional email with management link", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();
    const eventId = randomUUID();

    await seedOrganizationAndService(orgId, serviceId);
    await seedBooking({
      id: bookingId,
      orgId,
      serviceId,
      encryptedToken: encryptedTokenEnvelope,
    });

    await insertOutboxEvent({
      id: eventId,
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-CREATE-001",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Jane Doe",
        guestEmail: "jane@example.com",
        guestPhone: "+972500000000",
        priceAgorot: 25000,
      },
    });

    const emailService = new MockTransactionalEmailService();
    const bookingHandler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const shutdown = new AbortController();
    const dispatcherPromise = runOutboxDispatcher({
      pool: infra.pool,
      connectPublisher: () =>
        RabbitMqOutboxPublisher.connect(infra.rabbitmqUrl),
      batchSize: 10,
      pollIntervalMs: 50,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    const consumerPromise = runBookingConsumer({
      url: infra.rabbitmqUrl,
      handler: bookingHandler,
      prefetch: 5,
      retryDelayMs: 5000,
      maxAttempts: 3,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    for (let i = 0; i < 50; i++) {
      if (emailService.sent.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    shutdown.abort();
    await Promise.all([dispatcherPromise, consumerPromise]);

    expect(emailService.sent).toHaveLength(1);
    const sentEmail = emailService.sent[0];
    expect(sentEmail).toBeDefined();
    if (!sentEmail) throw new Error("sentEmail is undefined");
    expect(sentEmail.to).toBe("jane@example.com");
    expect(sentEmail.subject).toBe("Booking confirmed — SL-CREATE-001");
    expect(sentEmail.idempotencyKey).toBe(`booking-email/${eventId}`);
    expect(sentEmail.text).toContain("Price: ₪250.00");
    expect(sentEmail.text).toContain(
      `http://localhost:5173/booking/manage#token=${rawToken}`,
    );

    const outboxRows = await infra.pool.query(
      `SELECT published_at FROM outbox_event WHERE id = $1`,
      [eventId],
    );
    expect(outboxRows.rows[0]?.published_at).not.toBeNull();

    const receiptRows = await infra.pool.query(
      `SELECT * FROM consumer_receipt WHERE consumer_name = 'booking-email-v1' AND event_id = $1`,
      [eventId],
    );
    expect(receiptRows.rows).toHaveLength(1);
    expect(receiptRows.rows[0]?.outcome).toBe("email_sent");
  });

  it("dispatches booking.rescheduled outbox event and sends rescheduled email", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();
    const eventId = randomUUID();

    await seedOrganizationAndService(orgId, serviceId);
    await seedBooking({
      id: bookingId,
      orgId,
      serviceId,
      encryptedToken: encryptedTokenEnvelope,
    });

    await insertOutboxEvent({
      id: eventId,
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.rescheduled",
      occurredAt: "2026-06-16T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-RESCHED-001",
        previousResourceId: randomUUID(),
        previousStartAt: "2026-06-15T10:00:00.000Z",
        startAt: "2026-06-17T14:00:00.000Z",
        serviceEndAt: "2026-06-17T14:30:00.000Z",
        durationMinutes: 30,
        guestName: "Jane Doe",
        guestEmail: "jane@example.com",
        guestPhone: "+972500000000",
        priceAgorot: null,
      },
    });

    const emailService = new MockTransactionalEmailService();
    const bookingHandler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const shutdown = new AbortController();
    const dispatcherPromise = runOutboxDispatcher({
      pool: infra.pool,
      connectPublisher: () =>
        RabbitMqOutboxPublisher.connect(infra.rabbitmqUrl),
      batchSize: 10,
      pollIntervalMs: 50,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    const consumerPromise = runBookingConsumer({
      url: infra.rabbitmqUrl,
      handler: bookingHandler,
      prefetch: 5,
      retryDelayMs: 5000,
      maxAttempts: 3,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    for (let i = 0; i < 50; i++) {
      if (emailService.sent.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    shutdown.abort();
    await Promise.all([dispatcherPromise, consumerPromise]);

    expect(emailService.sent).toHaveLength(1);
    const sentEmail = emailService.sent[0];
    expect(sentEmail).toBeDefined();
    if (!sentEmail) throw new Error("sentEmail is undefined");
    expect(sentEmail.subject).toBe("Booking rescheduled — SL-RESCHED-001");
    expect(sentEmail.text).toContain("Previous Appointment:");
    expect(sentEmail.text).toContain("New Appointment:");
    expect(sentEmail.text).toContain(
      `http://localhost:5173/booking/manage#token=${rawToken}`,
    );
  });

  it("dispatches booking.cancelled outbox event and sends cancellation email with reason", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();
    const eventId = randomUUID();

    await seedOrganizationAndService(orgId, serviceId);
    await seedBooking({
      id: bookingId,
      orgId,
      serviceId,
      encryptedToken: encryptedTokenEnvelope,
    });

    await insertOutboxEvent({
      id: eventId,
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.cancelled",
      occurredAt: "2026-06-16T12:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-CANCEL-001",
        startAt: "2026-06-15T10:00:00.000Z",
        guestName: "Jane Doe",
        guestEmail: "jane@example.com",
        guestPhone: "+972500000000",
        cancelledAt: "2026-06-16T12:00:00.000Z",
        cancelledBy: "guest",
        cancellationReason: "Schedule conflict",
      },
    });

    const emailService = new MockTransactionalEmailService();
    const bookingHandler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const shutdown = new AbortController();
    const dispatcherPromise = runOutboxDispatcher({
      pool: infra.pool,
      connectPublisher: () =>
        RabbitMqOutboxPublisher.connect(infra.rabbitmqUrl),
      batchSize: 10,
      pollIntervalMs: 50,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    const consumerPromise = runBookingConsumer({
      url: infra.rabbitmqUrl,
      handler: bookingHandler,
      prefetch: 5,
      retryDelayMs: 5000,
      maxAttempts: 3,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    for (let i = 0; i < 50; i++) {
      if (emailService.sent.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    shutdown.abort();
    await Promise.all([dispatcherPromise, consumerPromise]);

    expect(emailService.sent).toHaveLength(1);
    const sentEmail = emailService.sent[0];
    expect(sentEmail).toBeDefined();
    if (!sentEmail) throw new Error("sentEmail is undefined");
    expect(sentEmail.subject).toBe("Booking cancelled — SL-CANCEL-001");
    expect(sentEmail.text).toContain("Cancellation reason: Schedule conflict");
    expect(sentEmail.text).toContain(
      `http://localhost:5173/booking/manage#token=${rawToken}`,
    );
  });

  it("handles events with guestEmail = null by creating skipped_no_email receipt without sending email", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();
    const eventId = randomUUID();

    await seedOrganizationAndService(orgId, serviceId);
    await seedBooking({
      id: bookingId,
      orgId,
      serviceId,
      guestEmail: null,
    });

    await insertOutboxEvent({
      id: eventId,
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-NOEMAIL-001",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Jane Doe",
        guestEmail: null,
        guestPhone: null,
        priceAgorot: null,
      },
    });

    const emailService = new MockTransactionalEmailService();
    const bookingHandler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const shutdown = new AbortController();
    const dispatcherPromise = runOutboxDispatcher({
      pool: infra.pool,
      connectPublisher: () =>
        RabbitMqOutboxPublisher.connect(infra.rabbitmqUrl),
      batchSize: 10,
      pollIntervalMs: 50,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    const consumerPromise = runBookingConsumer({
      url: infra.rabbitmqUrl,
      handler: bookingHandler,
      prefetch: 5,
      retryDelayMs: 5000,
      maxAttempts: 3,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    for (let i = 0; i < 30; i++) {
      const rows = await infra.pool.query(
        `SELECT * FROM consumer_receipt WHERE event_id = $1`,
        [eventId],
      );
      if (rows.rows.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    shutdown.abort();
    await Promise.all([dispatcherPromise, consumerPromise]);

    expect(emailService.sent).toHaveLength(0);

    const receiptRows = await infra.pool.query(
      `SELECT outcome FROM consumer_receipt WHERE consumer_name = 'booking-email-v1' AND event_id = $1`,
      [eventId],
    );
    expect(receiptRows.rows[0]?.outcome).toBe("skipped_no_email");
  });

  it("handles duplicate deliveries by sending email only once and acknowledging both", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();
    const eventId = randomUUID();

    await seedOrganizationAndService(orgId, serviceId);
    await seedBooking({
      id: bookingId,
      orgId,
      serviceId,
      encryptedToken: encryptedTokenEnvelope,
    });

    const eventPayload = {
      eventId,
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-DUP-001",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Jane Doe",
        guestEmail: "jane@example.com",
        guestPhone: "+972500000000",
        priceAgorot: 10000,
      },
    };

    await infra.rabbitChannel.sendToQueue(
      BOOKING_EVENTS_QUEUE,
      Buffer.from(JSON.stringify(eventPayload)),
      { persistent: true },
    );
    await infra.rabbitChannel.sendToQueue(
      BOOKING_EVENTS_QUEUE,
      Buffer.from(JSON.stringify(eventPayload)),
      { persistent: true },
    );

    const emailService = new MockTransactionalEmailService();
    const bookingHandler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const shutdown = new AbortController();
    const consumerPromise = runBookingConsumer({
      url: infra.rabbitmqUrl,
      handler: bookingHandler,
      prefetch: 5,
      retryDelayMs: 5000,
      maxAttempts: 3,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    for (let i = 0; i < 50; i++) {
      const q = await infra.rabbitChannel.checkQueue(BOOKING_EVENTS_QUEUE);
      if (q.messageCount === 0 && emailService.sent.length === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    shutdown.abort();
    await consumerPromise;

    expect(emailService.sent).toHaveLength(1);

    const receiptRows = await infra.pool.query(
      `SELECT count(*)::int as count FROM consumer_receipt WHERE consumer_name = 'booking-email-v1' AND event_id = $1`,
      [eventId],
    );
    expect(receiptRows.rows[0]?.count).toBe(1);
  });

  it("handles crash window: provider idempotency key is stable across delivery attempts", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();
    const eventId = randomUUID();

    await seedOrganizationAndService(orgId, serviceId);
    await seedBooking({
      id: bookingId,
      orgId,
      serviceId,
      encryptedToken: encryptedTokenEnvelope,
    });

    const event: Extract<
      Parameters<ReturnType<typeof createBookingEmailHandler>>[0],
      { eventType: "booking.created" }
    > = {
      eventId,
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-CRASH-001",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Jane Doe",
        guestEmail: "jane@example.com",
        guestPhone: "+972500000000",
        priceAgorot: 10000,
      },
    };

    const recordedIdempotencyKeys: string[] = [];
    const recordedPayloads: string[] = [];

    const emailService: TransactionalEmailService = {
      async send(input: SendTransactionalEmailInput) {
        recordedIdempotencyKeys.push(input.idempotencyKey);
        recordedPayloads.push(input.text);
        return { id: "resend-msg-1" };
      },
    };

    const handler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    // Run first attempt
    await handler(event);
    expect(recordedIdempotencyKeys).toHaveLength(1);
    expect(recordedIdempotencyKeys[0]).toBe(`booking-email/${eventId}`);

    // Simulate second attempt (e.g. after redelivery)
    await handler(event);
    // Because consumer receipt committed on first attempt, second attempt is skipped by idempotency
    expect(recordedIdempotencyKeys).toHaveLength(1);

    // Verify deterministic payload format
    expect(recordedPayloads[0]).toContain("SL-CRASH-001");
    expect(recordedPayloads[0]).toContain(rawToken);
  });

  it("routes tampered encrypted token directly to DLQ without sending email", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();
    const eventId = randomUUID();

    await seedOrganizationAndService(orgId, serviceId);
    const tamperedEnvelope =
      "v1.MTIzNDU2Nzg5MDEy.tamperedcipher.9bez_B22t0eCpU8sWX40LQ";
    await seedBooking({
      id: bookingId,
      orgId,
      serviceId,
      encryptedToken: tamperedEnvelope,
    });

    const eventPayload = {
      eventId,
      aggregateType: "booking",
      aggregateId: bookingId,
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-TAMPER-001",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Jane Doe",
        guestEmail: "jane@example.com",
        guestPhone: "+972500000000",
        priceAgorot: 10000,
      },
    };

    await infra.rabbitChannel.publish(
      EVENTS_EXCHANGE,
      "booking.created",
      Buffer.from(JSON.stringify(eventPayload)),
      {
        messageId: eventId,
        type: "booking.created",
        contentType: "application/json",
        persistent: true,
      },
    );

    const emailService = new MockTransactionalEmailService();
    const bookingHandler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const shutdown = new AbortController();
    const consumerPromise = runBookingConsumer({
      url: infra.rabbitmqUrl,
      handler: bookingHandler,
      prefetch: 5,
      retryDelayMs: 5000,
      maxAttempts: 3,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    await expect
      .poll(
        async () =>
          (await infra.rabbitChannel.checkQueue(BOOKING_EVENTS_DLQ))
            .messageCount,
        { timeout: 5000, interval: 50 },
      )
      .toBe(1);

    const dlqMessage = await infra.rabbitChannel.get(BOOKING_EVENTS_DLQ, {
      noAck: true,
    });

    shutdown.abort();
    await consumerPromise;

    expect(dlqMessage).toBeTruthy();
    expect(emailService.sent).toHaveLength(0);
    expect(
      (dlqMessage as Message).properties?.headers?.[
        "x-schedlane-dead-letter-reason"
      ],
    ).toBe("management_token_decryption_failed");
  });

  it("routes aggregate ID mismatch directly to DLQ", async () => {
    const orgId = randomUUID();
    const serviceId = randomUUID();
    const bookingId = randomUUID();
    const eventId = randomUUID();

    await seedOrganizationAndService(orgId, serviceId);
    await seedBooking({
      id: bookingId,
      orgId,
      serviceId,
      encryptedToken: encryptedTokenEnvelope,
    });

    const eventPayload = {
      eventId,
      aggregateType: "booking",
      aggregateId: randomUUID(), // Mismatch with payload.bookingId
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId,
        organizationId: orgId,
        resourceId: randomUUID(),
        serviceId,
        publicReference: "SL-MISMATCH-001",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 30,
        guestName: "Jane Doe",
        guestEmail: "jane@example.com",
        guestPhone: "+972500000000",
        priceAgorot: 10000,
      },
    };

    await infra.rabbitChannel.publish(
      EVENTS_EXCHANGE,
      "booking.created",
      Buffer.from(JSON.stringify(eventPayload)),
      {
        messageId: eventId,
        type: "booking.created",
        contentType: "application/json",
        persistent: true,
      },
    );

    const emailService = new MockTransactionalEmailService();
    const bookingHandler = createBookingEmailHandler({
      pool: infra.pool,
      emailService,
      encryptionKey,
      guestBookingManagementUrl: managementBaseUrl,
    });

    const shutdown = new AbortController();
    const consumerPromise = runBookingConsumer({
      url: infra.rabbitmqUrl,
      handler: bookingHandler,
      prefetch: 5,
      retryDelayMs: 5000,
      maxAttempts: 3,
      reconnectDelayMs: 100,
      signal: shutdown.signal,
    });

    await expect
      .poll(
        async () =>
          (await infra.rabbitChannel.checkQueue(BOOKING_EVENTS_DLQ))
            .messageCount,
        { timeout: 5000, interval: 50 },
      )
      .toBe(1);

    const dlqMessage = await infra.rabbitChannel.get(BOOKING_EVENTS_DLQ, {
      noAck: true,
    });

    shutdown.abort();
    await consumerPromise;

    expect(dlqMessage).toBeTruthy();
    expect(emailService.sent).toHaveLength(0);
    expect(
      (dlqMessage as Message).properties?.headers?.[
        "x-schedlane-dead-letter-reason"
      ],
    ).toMatch(/invalid_payload|aggregate_id_mismatch/);
  });
});
