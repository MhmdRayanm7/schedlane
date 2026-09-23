import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import { insertOutboxEventInTransaction } from "../../../src/outbox/persistence.js";

describe("transactional outbox persistence", () => {
  it("stores an unpublished JSON event in the caller-owned transaction", async () => {
    const aggregateId = randomUUID();
    const occurredAt = new Date("2026-09-23T09:15:00.123Z");
    const stored = await db.transaction().execute((trx) =>
      insertOutboxEventInTransaction(trx, {
        aggregateType: "booking",
        aggregateId,
        eventType: "booking.created",
        payload: { bookingId: aggregateId, nested: { enabled: true } },
        occurredAt,
      }),
    );

    expect(stored).toMatchObject({
      id: expect.any(String),
      aggregate_type: "booking",
      aggregate_id: aggregateId,
      event_type: "booking.created",
      payload: { bookingId: aggregateId, nested: { enabled: true } },
      occurred_at: occurredAt,
      published_at: null,
      created_at: expect.any(Date),
    });
    expect(
      await db
        .selectFrom("outbox_event")
        .selectAll()
        .where("id", "=", stored.id)
        .executeTakeFirstOrThrow(),
    ).toEqual(stored);
  });

  it("assigns a distinct event id to each stored event", async () => {
    const aggregateId = randomUUID();
    const ids = await db.transaction().execute(async (trx) => {
      const event = {
        aggregateType: "booking",
        aggregateId,
        eventType: "booking.created",
        payload: { bookingId: aggregateId },
        occurredAt: new Date("2026-09-23T09:15:00.000Z"),
      };
      const first = await insertOutboxEventInTransaction(trx, event);
      const second = await insertOutboxEventInTransaction(trx, event);
      return [first.id, second.id];
    });

    expect(ids[0]).not.toBe(ids[1]);
  });

  it("does not persist an event when the caller transaction rolls back", async () => {
    const aggregateId = randomUUID();
    await expect(
      db.transaction().execute(async (trx) => {
        await insertOutboxEventInTransaction(trx, {
          aggregateType: "booking",
          aggregateId,
          eventType: "booking.created",
          payload: { bookingId: aggregateId },
          occurredAt: new Date("2026-09-23T09:15:00.000Z"),
        });
        throw new Error("roll back test transaction");
      }),
    ).rejects.toThrow("roll back test transaction");

    expect(
      await db
        .selectFrom("outbox_event")
        .select("id")
        .where("aggregate_id", "=", aggregateId)
        .execute(),
    ).toEqual([]);
  });
});
