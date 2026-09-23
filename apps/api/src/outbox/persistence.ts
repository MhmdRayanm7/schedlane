import type { Transaction } from "kysely";
import type { Database } from "../db-types.js";
import type { OutboxEvent } from "./event.js";

export function insertOutboxEventInTransaction<TType extends string, TPayload>(
  trx: Transaction<Database>,
  event: OutboxEvent<TType, TPayload>,
) {
  return trx
    .insertInto("outbox_event")
    .values({
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      event_type: event.eventType,
      payload: event.payload,
      occurred_at: event.occurredAt,
      published_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
