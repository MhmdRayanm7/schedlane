import type { Pool, PoolClient } from "pg";
import type { IntegrationEventMessage } from "../messaging/event-message.js";
import type { OutboxPublisher } from "../messaging/rabbitmq-publisher.js";

type OutboxEventRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: unknown;
  occurred_at: Date;
  created_at: Date;
};

type DispatchOutboxBatchInput = {
  pool: Pool;
  publisher: OutboxPublisher;
  batchSize: number;
};

function toIntegrationEventMessage(
  row: OutboxEventRow,
): IntegrationEventMessage {
  return {
    eventId: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at.toISOString(),
    payload: row.payload,
  };
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

export async function dispatchOutboxBatch({
  pool,
  publisher,
  batchSize,
}: DispatchOutboxBatchInput): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new Error("Outbox batch size must be a positive integer");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const selected = await client.query<OutboxEventRow>(
        `SELECT
           id,
           aggregate_type,
           aggregate_id,
           event_type,
           payload,
           occurred_at,
           created_at
         FROM outbox_event
         WHERE published_at IS NULL
         ORDER BY created_at ASC, id ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [batchSize],
      );

      if (selected.rows.length === 0) {
        await client.query("COMMIT");
        return 0;
      }

      await publisher.publishBatch(
        selected.rows.map(toIntegrationEventMessage),
      );

      const selectedIds = selected.rows.map((row) => row.id);
      const marked = await client.query<{ id: string }>(
        `UPDATE outbox_event
         SET published_at = clock_timestamp()
         WHERE id = ANY($1::uuid[])
           AND published_at IS NULL
         RETURNING id`,
        [selectedIds],
      );
      if (marked.rowCount !== selected.rows.length)
        throw new Error(
          `Outbox publish mark count mismatch: selected ${selected.rows.length}, marked ${marked.rowCount ?? 0}`,
        );

      await client.query("COMMIT");
      return selected.rows.length;
    } catch (error) {
      await rollback(client);
      throw error;
    }
  } finally {
    client.release();
  }
}
