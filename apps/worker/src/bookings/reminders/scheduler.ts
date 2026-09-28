import type { Pool, PoolClient } from "pg";

type DueReminderRow = {
  id: string;
  booking_id: string;
  scheduled_for_start_at: Date;
  booking_start_at: Date;
  booking_status: string;
  guest_email: string | null;
  suspended_at: Date | null;
  archived_at: Date | null;
};

type DispatchDueReminderBatchInput = {
  pool: Pool;
  batchSize: number;
  now?: Date;
};

function skipReason(row: DueReminderRow, now: Date): string | null {
  if (row.booking_status !== "confirmed")
    return `booking_${row.booking_status}`;
  if (!row.guest_email) return "no_email";
  if (row.booking_start_at.getTime() !== row.scheduled_for_start_at.getTime())
    return "rescheduled";
  if (row.booking_start_at.getTime() <= now.getTime()) return "start_passed";
  if (row.archived_at) return "organization_archived";
  if (row.suspended_at) return "organization_suspended";
  return null;
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

export async function dispatchDueBookingReminderBatch({
  pool,
  batchSize,
  now = new Date(),
}: DispatchDueReminderBatchInput): Promise<{
  dispatched: number;
  skipped: number;
}> {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new Error("Booking reminder batch size must be a positive integer");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const selected = await client.query<DueReminderRow>(
        `SELECT
           reminder.id,
           reminder.booking_id,
           reminder.scheduled_for_start_at,
           booking.start_at AS booking_start_at,
           booking.status AS booking_status,
           booking.guest_email,
           organization.suspended_at,
           organization.archived_at
         FROM booking_reminder AS reminder
         JOIN booking ON booking.id = reminder.booking_id
         JOIN organization ON organization.id = booking.organization_id
         WHERE reminder.status = 'pending'
           AND reminder.due_at <= $1
         ORDER BY reminder.due_at ASC, reminder.id ASC
         LIMIT $2
         FOR UPDATE OF reminder SKIP LOCKED`,
        [now, batchSize],
      );

      let dispatched = 0;
      let skipped = 0;
      for (const reminder of selected.rows) {
        const reason = skipReason(reminder, now);
        if (reason) {
          await client.query(
            `UPDATE booking_reminder
             SET status = 'skipped', skipped_at = $2, skip_reason = $3
             WHERE id = $1 AND status = 'pending'`,
            [reminder.id, now, reason],
          );
          skipped += 1;
          continue;
        }

        await client.query(
          `INSERT INTO outbox_event (
             aggregate_type, aggregate_id, event_type, payload, occurred_at,
             published_at
           ) VALUES (
             'booking', $1, 'booking.reminder_due', $2::jsonb, $3, NULL
           )`,
          [
            reminder.booking_id,
            JSON.stringify({
              reminderId: reminder.id,
              bookingId: reminder.booking_id,
              scheduledForStartAt:
                reminder.scheduled_for_start_at.toISOString(),
            }),
            now,
          ],
        );
        await client.query(
          `UPDATE booking_reminder
           SET status = 'dispatched', dispatched_at = $2
           WHERE id = $1 AND status = 'pending'`,
          [reminder.id, now],
        );
        dispatched += 1;
      }

      await client.query("COMMIT");
      return { dispatched, skipped };
    } catch (error) {
      await rollback(client);
      throw error;
    }
  } finally {
    client.release();
  }
}

type RunBookingReminderSchedulerInput = {
  pool: Pool;
  batchSize: number;
  pollIntervalMs: number;
  signal: AbortSignal;
};

function waitForDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, milliseconds);
    function finish() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}

function safeErrorMetadata(error: unknown) {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const code = "code" in error ? error.code : undefined;
  return {
    name: error.name,
    ...(typeof code === "string" ? { code } : {}),
  };
}

export async function runBookingReminderScheduler({
  pool,
  batchSize,
  pollIntervalMs,
  signal,
}: RunBookingReminderSchedulerInput): Promise<void> {
  while (!signal.aborted) {
    try {
      const result = await dispatchDueBookingReminderBatch({ pool, batchSize });
      if (result.dispatched > 0 || result.skipped > 0)
        console.log("Booking reminder batch processed", result);
      if (result.dispatched + result.skipped < batchSize)
        await waitForDelay(pollIntervalMs, signal);
    } catch (error) {
      console.error(
        "Booking reminder scheduler retrying",
        safeErrorMetadata(error),
      );
      await waitForDelay(pollIntervalMs, signal);
    }
  }
}
