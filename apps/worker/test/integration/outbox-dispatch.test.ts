import { randomUUID } from "node:crypto";
import type { GetMessage } from "amqplib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IntegrationEventMessage } from "../../src/messaging/event-message.js";
import type { OutboxPublisher } from "../../src/messaging/rabbitmq-publisher.js";
import { RabbitMqOutboxPublisher } from "../../src/messaging/rabbitmq-publisher.js";
import {
  BOOKING_EVENTS_QUEUE,
  EVENTS_EXCHANGE,
  EVENTS_EXCHANGE_TYPE,
} from "../../src/messaging/topology.js";
import { dispatchOutboxBatch } from "../../src/outbox/postgres-outbox.js";
import { startWorkerTestInfrastructure } from "../helpers/test-infrastructure.js";

type TestInfrastructure = Awaited<
  ReturnType<typeof startWorkerTestInfrastructure>
>;

let infrastructure: TestInfrastructure;

beforeAll(async () => {
  infrastructure = await startWorkerTestInfrastructure();
});

beforeEach(async () => {
  await infrastructure.reset();
});

afterAll(async () => {
  await infrastructure.stop();
});

type InsertEventOverrides = {
  id?: string;
  aggregateId?: string;
  eventType?: string;
  payload?: unknown;
  occurredAt?: Date;
  createdAt?: Date;
};

async function insertEvent({
  id = randomUUID(),
  aggregateId = randomUUID(),
  eventType = "booking.created",
  payload = { bookingId: aggregateId },
  occurredAt = new Date("2026-09-23T09:00:00.000Z"),
  createdAt = new Date("2026-09-23T09:00:01.000Z"),
}: InsertEventOverrides = {}) {
  const result = await infrastructure.pool.query<{
    id: string;
    published_at: Date | null;
  }>(
    `INSERT INTO outbox_event (
       id, aggregate_type, aggregate_id, event_type, payload, occurred_at,
       published_at, created_at
     ) VALUES ($1, 'booking', $2, $3, $4::jsonb, $5, NULL, $6)
     RETURNING id, published_at`,
    [
      id,
      aggregateId,
      eventType,
      JSON.stringify(payload),
      occurredAt,
      createdAt,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Test outbox insert did not return a row");
  return row;
}

async function publicationStates() {
  return (
    await infrastructure.pool.query<{
      id: string;
      published_at: Date | null;
    }>("SELECT id, published_at FROM outbox_event ORDER BY created_at, id")
  ).rows;
}

function messageEnvelope(message: GetMessage) {
  return JSON.parse(
    message.content.toString("utf8"),
  ) as IntegrationEventMessage;
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("reliable outbox dispatch", () => {
  it("asserts durable topology and publishes a confirmed persistent Booking event", async () => {
    await infrastructure.rabbitChannel.deleteQueue(BOOKING_EVENTS_QUEUE);
    await infrastructure.rabbitChannel.deleteExchange(EVENTS_EXCHANGE);
    const publisher = await RabbitMqOutboxPublisher.connect(
      infrastructure.rabbitmqUrl,
    );
    const event: IntegrationEventMessage = {
      eventId: randomUUID(),
      aggregateType: "booking",
      aggregateId: randomUUID(),
      eventType: "booking.created",
      occurredAt: "2026-09-23T09:00:00.000Z",
      payload: { bookingId: "snapshot-booking" },
    };
    try {
      await infrastructure.rabbitChannel.assertExchange(
        EVENTS_EXCHANGE,
        EVENTS_EXCHANGE_TYPE,
        { durable: true },
      );
      await infrastructure.rabbitChannel.assertQueue(BOOKING_EVENTS_QUEUE, {
        durable: true,
      });

      await publisher.publishBatch([event]);

      const message = await infrastructure.rabbitChannel.get(
        BOOKING_EVENTS_QUEUE,
        { noAck: false },
      );
      expect(message).not.toBe(false);
      if (!message) throw new Error("Expected routed RabbitMQ message");
      expect(messageEnvelope(message)).toEqual(event);
      expect(message.fields.routingKey).toBe(event.eventType);
      expect(message.properties).toMatchObject({
        messageId: event.eventId,
        type: event.eventType,
        contentType: "application/json",
        contentEncoding: "utf-8",
        deliveryMode: 2,
      });
      infrastructure.rabbitChannel.ack(message);
    } finally {
      await publisher.close();
    }
  });

  it("fails a broker-confirmed mandatory publication that is unroutable", async () => {
    const publisher = await RabbitMqOutboxPublisher.connect(
      infrastructure.rabbitmqUrl,
    );
    try {
      await expect(
        publisher.publishBatch([
          {
            eventId: randomUUID(),
            aggregateType: "unsupported",
            aggregateId: randomUUID(),
            eventType: "unsupported.created",
            occurredAt: "2026-09-23T09:00:00.000Z",
            payload: {},
          },
        ]),
      ).rejects.toThrow("unroutable event");
    } finally {
      await publisher.close();
    }
  });

  it("publishes an outbox row before marking it dispatched", async () => {
    const row = await insertEvent({ payload: { bookingId: "event-snapshot" } });
    const publisher = await RabbitMqOutboxPublisher.connect(
      infrastructure.rabbitmqUrl,
    );
    try {
      expect(
        await dispatchOutboxBatch({
          pool: infrastructure.pool,
          publisher,
          batchSize: 25,
        }),
      ).toBe(1);
      expect((await publicationStates())[0]?.published_at).toBeInstanceOf(Date);

      const message = await infrastructure.rabbitChannel.get(
        BOOKING_EVENTS_QUEUE,
        { noAck: false },
      );
      expect(message).not.toBe(false);
      if (!message) throw new Error("Expected dispatched RabbitMQ message");
      expect(messageEnvelope(message)).toMatchObject({ eventId: row.id });
      infrastructure.rabbitChannel.ack(message);
    } finally {
      await publisher.close();
    }
  });

  it("returns zero for an empty batch without publishing", async () => {
    const observed: IntegrationEventMessage[][] = [];
    const publisher: OutboxPublisher = {
      async publishBatch(events) {
        observed.push([...events]);
      },
    };
    expect(
      await dispatchOutboxBatch({
        pool: infrastructure.pool,
        publisher,
        batchSize: 25,
      }),
    ).toBe(0);
    expect(observed).toEqual([]);
  });

  it("rolls back publication marking when the publisher fails", async () => {
    const row = await insertEvent();
    const publisher: OutboxPublisher = {
      async publishBatch() {
        throw new Error("simulated publish failure");
      },
    };
    await expect(
      dispatchOutboxBatch({
        pool: infrastructure.pool,
        publisher,
        batchSize: 25,
      }),
    ).rejects.toThrow("simulated publish failure");
    expect(await publicationStates()).toEqual([
      { id: row.id, published_at: null },
    ]);
  });

  it("rolls back an unroutable event instead of marking it published", async () => {
    const row = await insertEvent({ eventType: "unsupported.created" });
    const publisher = await RabbitMqOutboxPublisher.connect(
      infrastructure.rabbitmqUrl,
    );
    try {
      await expect(
        dispatchOutboxBatch({
          pool: infrastructure.pool,
          publisher,
          batchSize: 25,
        }),
      ).rejects.toThrow("unroutable event");
      expect(await publicationStates()).toEqual([
        { id: row.id, published_at: null },
      ]);
    } finally {
      await publisher.close();
    }
  });

  it("retries an unpublished event with the same event id", async () => {
    const row = await insertEvent();
    const observedEventIds: string[] = [];
    let shouldFail = true;
    const publisher: OutboxPublisher = {
      async publishBatch(events) {
        observedEventIds.push(...events.map((event) => event.eventId));
        if (shouldFail) {
          shouldFail = false;
          throw new Error("uncertain failure after observation");
        }
      },
    };

    await expect(
      dispatchOutboxBatch({
        pool: infrastructure.pool,
        publisher,
        batchSize: 1,
      }),
    ).rejects.toThrow("uncertain failure after observation");
    expect((await publicationStates())[0]?.published_at).toBeNull();
    expect(
      await dispatchOutboxBatch({
        pool: infrastructure.pool,
        publisher,
        batchSize: 1,
      }),
    ).toBe(1);
    expect(observedEventIds).toEqual([row.id, row.id]);
    expect((await publicationStates())[0]?.published_at).toBeInstanceOf(Date);
  });

  it("orders a limited batch and marks only its confirmed rows", async () => {
    const firstId = "00000000-0000-7000-8000-000000000001";
    const secondId = "00000000-0000-7000-8000-000000000002";
    const thirdId = "00000000-0000-7000-8000-000000000003";
    const early = new Date("2026-09-23T09:00:00.000Z");
    const late = new Date("2026-09-23T09:01:00.000Z");
    await insertEvent({ id: thirdId, createdAt: late });
    await insertEvent({ id: secondId, createdAt: early });
    await insertEvent({ id: firstId, createdAt: early });
    const observed: string[] = [];
    const publisher: OutboxPublisher = {
      async publishBatch(events) {
        observed.push(...events.map((event) => event.eventId));
      },
    };

    expect(
      await dispatchOutboxBatch({
        pool: infrastructure.pool,
        publisher,
        batchSize: 2,
      }),
    ).toBe(2);
    expect(observed).toEqual([firstId, secondId]);
    expect(await publicationStates()).toEqual([
      { id: firstId, published_at: expect.any(Date) },
      { id: secondId, published_at: expect.any(Date) },
      { id: thirdId, published_at: null },
    ]);
  });

  it("rolls back every selected row after a partial batch failure", async () => {
    const first = await insertEvent({
      createdAt: new Date("2026-09-23T09:00:00.000Z"),
    });
    const second = await insertEvent({
      createdAt: new Date("2026-09-23T09:01:00.000Z"),
    });
    const observed: string[] = [];
    const publisher: OutboxPublisher = {
      async publishBatch(events) {
        observed.push(...events.map((event) => event.eventId));
        throw new Error("partial batch failure");
      },
    };

    await expect(
      dispatchOutboxBatch({
        pool: infrastructure.pool,
        publisher,
        batchSize: 2,
      }),
    ).rejects.toThrow("partial batch failure");
    expect(observed).toEqual([first.id, second.id]);
    expect(await publicationStates()).toEqual([
      { id: first.id, published_at: null },
      { id: second.id, published_at: null },
    ]);
  });

  it("uses SKIP LOCKED so concurrent dispatchers claim different rows", async () => {
    const first = await insertEvent({
      createdAt: new Date("2026-09-23T09:00:00.000Z"),
    });
    const second = await insertEvent({
      createdAt: new Date("2026-09-23T09:01:00.000Z"),
    });
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const firstObserved: string[] = [];
    const secondObserved: string[] = [];
    const firstPublisher: OutboxPublisher = {
      async publishBatch(events) {
        firstObserved.push(...events.map((event) => event.eventId));
        firstEntered.resolve();
        await releaseFirst.promise;
      },
    };
    const secondPublisher: OutboxPublisher = {
      async publishBatch(events) {
        secondObserved.push(...events.map((event) => event.eventId));
      },
    };

    const firstDispatch = dispatchOutboxBatch({
      pool: infrastructure.pool,
      publisher: firstPublisher,
      batchSize: 1,
    });
    await firstEntered.promise;
    const secondCount = await dispatchOutboxBatch({
      pool: infrastructure.pool,
      publisher: secondPublisher,
      batchSize: 1,
    });
    releaseFirst.resolve();

    expect(await firstDispatch).toBe(1);
    expect(secondCount).toBe(1);
    expect(firstObserved).toEqual([first.id]);
    expect(secondObserved).toEqual([second.id]);
    expect(
      (await publicationStates()).every(
        (row) => row.published_at instanceof Date,
      ),
    ).toBe(true);
  });

  it("allows only one concurrent dispatcher to claim a single row", async () => {
    const row = await insertEvent();
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const firstPublisher: OutboxPublisher = {
      async publishBatch() {
        firstEntered.resolve();
        await releaseFirst.promise;
      },
    };
    const unexpectedPublisher: OutboxPublisher = {
      async publishBatch() {
        throw new Error("locked row was published twice concurrently");
      },
    };

    const firstDispatch = dispatchOutboxBatch({
      pool: infrastructure.pool,
      publisher: firstPublisher,
      batchSize: 1,
    });
    await firstEntered.promise;
    expect(
      await dispatchOutboxBatch({
        pool: infrastructure.pool,
        publisher: unexpectedPublisher,
        batchSize: 1,
      }),
    ).toBe(0);
    releaseFirst.resolve();

    expect(await firstDispatch).toBe(1);
    expect(await publicationStates()).toEqual([
      { id: row.id, published_at: expect.any(Date) },
    ]);
  });

  it("rolls back when the published-row count invariant is violated", async () => {
    const row = await insertEvent();
    await infrastructure.pool.query(`
      CREATE FUNCTION skip_outbox_publish_mark() RETURNS trigger AS $$
      BEGIN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER skip_outbox_publish_mark
      BEFORE UPDATE ON outbox_event
      FOR EACH ROW EXECUTE FUNCTION skip_outbox_publish_mark();
    `);
    const publisher: OutboxPublisher = { async publishBatch() {} };
    try {
      await expect(
        dispatchOutboxBatch({
          pool: infrastructure.pool,
          publisher,
          batchSize: 1,
        }),
      ).rejects.toThrow("mark count mismatch");
      expect(await publicationStates()).toEqual([
        { id: row.id, published_at: null },
      ]);
    } finally {
      await infrastructure.pool.query(`
        DROP TRIGGER IF EXISTS skip_outbox_publish_mark ON outbox_event;
        DROP FUNCTION IF EXISTS skip_outbox_publish_mark();
      `);
    }
  });
});
