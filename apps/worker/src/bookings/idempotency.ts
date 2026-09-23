import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export const BOOKING_EMAIL_CONSUMER_NAME = "booking-email-v1";
export const CONSUMER_OUTCOME_EMAIL_SENT = "email_sent";
export const CONSUMER_OUTCOME_SKIPPED_NO_EMAIL = "skipped_no_email";

export function getConsumerAdvisoryLockKey(
  consumerName: string,
  eventId: string,
): bigint {
  const hash = createHash("sha256")
    .update(`${consumerName}:${eventId}`, "utf8")
    .digest();
  return hash.readBigInt64BE(0);
}

export type ProcessWithIdempotencyOptions<T> = {
  pool: Pool;
  consumerName: string;
  eventId: string;
  eventType: string;
  onFirstExecution: (
    client: PoolClient,
  ) => Promise<{ outcome: string; result?: T | undefined }>;
};

export type ProcessWithIdempotencyResult<T> =
  | { duplicate: false; outcome: string; result?: T | undefined }
  | { duplicate: true; outcome: string };

export async function processWithIdempotency<T>({
  pool,
  consumerName,
  eventId,
  eventType,
  onFirstExecution,
}: ProcessWithIdempotencyOptions<T>): Promise<ProcessWithIdempotencyResult<T>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockKey = getConsumerAdvisoryLockKey(consumerName, eventId);
    await client.query("SELECT pg_advisory_xact_lock($1)", [
      lockKey.toString(),
    ]);

    const existing = await client.query<{ outcome: string }>(
      "SELECT outcome FROM consumer_receipt WHERE consumer_name = $1 AND event_id = $2",
      [consumerName, eventId],
    );

    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      return {
        duplicate: true,
        outcome: existing.rows[0]?.outcome ?? "unknown",
      };
    }

    const { outcome, result } = await onFirstExecution(client);

    await client.query(
      "INSERT INTO consumer_receipt (consumer_name, event_id, event_type, outcome) VALUES ($1, $2, $3, $4)",
      [consumerName, eventId, eventType, outcome],
    );

    await client.query("COMMIT");
    return { duplicate: false, outcome, result };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
