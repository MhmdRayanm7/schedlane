import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  BOOKING_EMAIL_CONSUMER_NAME,
  CONSUMER_OUTCOME_EMAIL_SENT,
  CONSUMER_OUTCOME_SKIPPED_NO_EMAIL,
  getConsumerAdvisoryLockKey,
  processWithIdempotency,
} from "../../src/bookings/idempotency.js";
import { startWorkerTestInfrastructure } from "../helpers/test-infrastructure.js";

const infra = await startWorkerTestInfrastructure();
beforeEach(() => infra.reset());
afterAll(() => infra.stop());

describe("booking event consumer idempotency", () => {
  const eventId = "018f9d0c-1a2b-7c3d-8e4f-5a6b7c8d9e0f";
  const eventType = "booking.created";

  it("hashes consumer name and event ID deterministically into a 64-bit integer", () => {
    const key1 = getConsumerAdvisoryLockKey(
      BOOKING_EMAIL_CONSUMER_NAME,
      eventId,
    );
    const key2 = getConsumerAdvisoryLockKey(
      BOOKING_EMAIL_CONSUMER_NAME,
      eventId,
    );
    expect(key1).toBe(key2);
    expect(typeof key1).toBe("bigint");

    const keyDifferentEvent = getConsumerAdvisoryLockKey(
      BOOKING_EMAIL_CONSUMER_NAME,
      "018f9d0c-1a2b-7c3d-8e4f-5a6b7c8d9e00",
    );
    expect(key1).not.toBe(keyDifferentEvent);
  });

  it("processes a first-time event and commits a consumer receipt", async () => {
    let sideEffectCalls = 0;

    const result = await processWithIdempotency({
      pool: infra.pool,
      consumerName: BOOKING_EMAIL_CONSUMER_NAME,
      eventId,
      eventType,
      onFirstExecution: async () => {
        sideEffectCalls += 1;
        return { outcome: CONSUMER_OUTCOME_EMAIL_SENT, result: "sent-id-123" };
      },
    });

    expect(result).toEqual({
      duplicate: false,
      outcome: CONSUMER_OUTCOME_EMAIL_SENT,
      result: "sent-id-123",
    });
    expect(sideEffectCalls).toBe(1);

    const rows = await infra.pool.query(
      "SELECT consumer_name, event_id, event_type, outcome FROM consumer_receipt WHERE consumer_name = $1 AND event_id = $2",
      [BOOKING_EMAIL_CONSUMER_NAME, eventId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toEqual({
      consumer_name: BOOKING_EMAIL_CONSUMER_NAME,
      event_id: eventId,
      event_type: eventType,
      outcome: CONSUMER_OUTCOME_EMAIL_SENT,
    });
  });

  it("skips repeating side effects when the same event is processed a second time", async () => {
    let sideEffectCalls = 0;

    const first = await processWithIdempotency({
      pool: infra.pool,
      consumerName: BOOKING_EMAIL_CONSUMER_NAME,
      eventId,
      eventType,
      onFirstExecution: async () => {
        sideEffectCalls += 1;
        return { outcome: CONSUMER_OUTCOME_EMAIL_SENT };
      },
    });
    expect(first.duplicate).toBe(false);
    expect(sideEffectCalls).toBe(1);

    const second = await processWithIdempotency({
      pool: infra.pool,
      consumerName: BOOKING_EMAIL_CONSUMER_NAME,
      eventId,
      eventType,
      onFirstExecution: async () => {
        sideEffectCalls += 1;
        return { outcome: CONSUMER_OUTCOME_EMAIL_SENT };
      },
    });
    expect(second).toEqual({
      duplicate: true,
      outcome: CONSUMER_OUTCOME_EMAIL_SENT,
    });
    expect(sideEffectCalls).toBe(1);
  });

  it("serializes concurrent duplicate deliveries and invokes side effect exactly once", async () => {
    let sideEffectCalls = 0;

    const executeAttempt = () =>
      processWithIdempotency({
        pool: infra.pool,
        consumerName: BOOKING_EMAIL_CONSUMER_NAME,
        eventId,
        eventType,
        onFirstExecution: async () => {
          sideEffectCalls += 1;
          // Simulate brief work
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { outcome: CONSUMER_OUTCOME_EMAIL_SENT };
        },
      });

    const [res1, res2] = await Promise.all([
      executeAttempt(),
      executeAttempt(),
    ]);

    expect(sideEffectCalls).toBe(1);
    const duplicates = [res1.duplicate, res2.duplicate].sort();
    expect(duplicates).toEqual([false, true]);

    const receiptCount = await infra.pool.query(
      "SELECT count(*)::int as count FROM consumer_receipt WHERE consumer_name = $1 AND event_id = $2",
      [BOOKING_EMAIL_CONSUMER_NAME, eventId],
    );
    expect(receiptCount.rows[0]?.count).toBe(1);
  });

  it("records skipped_no_email outcome without invoking email side effects", async () => {
    const result = await processWithIdempotency({
      pool: infra.pool,
      consumerName: BOOKING_EMAIL_CONSUMER_NAME,
      eventId,
      eventType,
      onFirstExecution: async () => {
        return { outcome: CONSUMER_OUTCOME_SKIPPED_NO_EMAIL };
      },
    });

    expect(result).toEqual({
      duplicate: false,
      outcome: CONSUMER_OUTCOME_SKIPPED_NO_EMAIL,
    });

    const duplicate = await processWithIdempotency({
      pool: infra.pool,
      consumerName: BOOKING_EMAIL_CONSUMER_NAME,
      eventId,
      eventType,
      onFirstExecution: async () => {
        throw new Error("Should not be called");
      },
    });

    expect(duplicate).toEqual({
      duplicate: true,
      outcome: CONSUMER_OUTCOME_SKIPPED_NO_EMAIL,
    });
  });

  it("processes different event IDs for the same booking independently", async () => {
    const createdEventId = "018f9d0c-1a2b-7c3d-8e4f-5a6b7c8d9e01";
    const rescheduledEventId = "018f9d0c-1a2b-7c3d-8e4f-5a6b7c8d9e02";
    const cancelledEventId = "018f9d0c-1a2b-7c3d-8e4f-5a6b7c8d9e03";

    let createdCalls = 0;
    let rescheduledCalls = 0;
    let cancelledCalls = 0;

    await processWithIdempotency({
      pool: infra.pool,
      consumerName: BOOKING_EMAIL_CONSUMER_NAME,
      eventId: createdEventId,
      eventType: "booking.created",
      onFirstExecution: async () => {
        createdCalls += 1;
        return { outcome: CONSUMER_OUTCOME_EMAIL_SENT };
      },
    });

    await processWithIdempotency({
      pool: infra.pool,
      consumerName: BOOKING_EMAIL_CONSUMER_NAME,
      eventId: rescheduledEventId,
      eventType: "booking.rescheduled",
      onFirstExecution: async () => {
        rescheduledCalls += 1;
        return { outcome: CONSUMER_OUTCOME_EMAIL_SENT };
      },
    });

    await processWithIdempotency({
      pool: infra.pool,
      consumerName: BOOKING_EMAIL_CONSUMER_NAME,
      eventId: cancelledEventId,
      eventType: "booking.cancelled",
      onFirstExecution: async () => {
        cancelledCalls += 1;
        return { outcome: CONSUMER_OUTCOME_EMAIL_SENT };
      },
    });

    expect(createdCalls).toBe(1);
    expect(rescheduledCalls).toBe(1);
    expect(cancelledCalls).toBe(1);

    const rows = await infra.pool.query(
      "SELECT count(*)::int as count FROM consumer_receipt WHERE consumer_name = $1",
      [BOOKING_EMAIL_CONSUMER_NAME],
    );
    expect(rows.rows[0]?.count).toBe(3);
  });

  it("rolls back receipt persistence when side effect throws", async () => {
    await expect(
      processWithIdempotency({
        pool: infra.pool,
        consumerName: BOOKING_EMAIL_CONSUMER_NAME,
        eventId,
        eventType,
        onFirstExecution: async () => {
          throw new Error("Email provider network error");
        },
      }),
    ).rejects.toThrow("Email provider network error");

    const rows = await infra.pool.query(
      "SELECT count(*)::int as count FROM consumer_receipt WHERE consumer_name = $1 AND event_id = $2",
      [BOOKING_EMAIL_CONSUMER_NAME, eventId],
    );
    expect(rows.rows[0]?.count).toBe(0);
  });
});
