import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import { type Channel, type ChannelModel, connect } from "amqplib";
import { Pool } from "pg";
import {
  assertEventTopology,
  BOOKING_EVENTS_DLQ,
  BOOKING_EVENTS_QUEUE,
  BOOKING_EVENTS_RETRY_QUEUE,
  ORGANIZATION_REQUEST_EVENTS_DLQ,
  ORGANIZATION_REQUEST_EVENTS_QUEUE,
  ORGANIZATION_REQUEST_EVENTS_RETRY_QUEUE,
  PUBLICATION_EVENTS_DLQ,
  PUBLICATION_EVENTS_QUEUE,
  PUBLICATION_EVENTS_RETRY_QUEUE,
} from "../../src/messaging/topology.js";

export async function startWorkerTestInfrastructure() {
  const [postgres, rabbitmq] = await Promise.all([
    new PostgreSqlContainer("postgres:18")
      .withDatabase("schedlane_worker_test")
      .withUsername("schedlane_worker_test")
      .withPassword("integration-test-only")
      .withStartupTimeout(120_000)
      .start(),
    new RabbitMQContainer("rabbitmq:4-management")
      .withStartupTimeout(120_000)
      .start(),
  ]);
  const pool = new Pool({ connectionString: postgres.getConnectionUri() });
  const clientShutdowns: Promise<void>[] = [];
  pool.on("connect", (client) => {
    clientShutdowns.push(
      new Promise<void>((resolve) => client.once("end", resolve)),
    );
  });
  let rabbitConnection: ChannelModel | undefined;
  let rabbitChannel: Channel | undefined;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organization (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL,
        timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
        suspended_at timestamptz NULL,
        archived_at timestamptz NULL
      );

      CREATE TABLE IF NOT EXISTS service (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES organization(id),
        name text NOT NULL,
        slug text NOT NULL,
        duration_minutes integer NOT NULL,
        price_agorot integer NULL
      );

      CREATE TABLE IF NOT EXISTS resource (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES organization(id),
        name text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS booking (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES organization(id),
        service_id uuid NOT NULL REFERENCES service(id),
        resource_id uuid NULL REFERENCES resource(id),
        public_reference text NOT NULL,
        status text NOT NULL,
        source text NOT NULL DEFAULT 'public',
        start_at timestamptz NOT NULL,
        end_at timestamptz NOT NULL,
        duration_minutes integer NOT NULL DEFAULT 30,
        price_agorot integer NULL,
        guest_name text NOT NULL,
        guest_email text NULL,
        guest_phone text NULL,
        guest_management_token_hash text NULL,
        guest_management_token_encrypted text NULL,
        created_at timestamptz NOT NULL DEFAULT current_timestamp
      );

      CREATE TABLE IF NOT EXISTS booking_reminder (
        id uuid PRIMARY KEY DEFAULT uuidv7(),
        booking_id uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
        scheduled_for_start_at timestamptz NOT NULL,
        due_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT current_timestamp,
        dispatched_at timestamptz NULL,
        sent_at timestamptz NULL,
        cancelled_at timestamptz NULL,
        skipped_at timestamptz NULL,
        skip_reason text NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS booking_reminder_one_pending_per_booking_idx
        ON booking_reminder (booking_id) WHERE status = 'pending';
      CREATE INDEX IF NOT EXISTS booking_reminder_pending_due_idx
        ON booking_reminder (due_at, id) WHERE status = 'pending';

      CREATE TABLE IF NOT EXISTS outbox_event (
        id uuid PRIMARY KEY DEFAULT uuidv7(),
        aggregate_type text NOT NULL,
        aggregate_id uuid NOT NULL,
        event_type text NOT NULL,
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL,
        published_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT current_timestamp
      );

      CREATE TABLE IF NOT EXISTS consumer_receipt (
        consumer_name text NOT NULL,
        event_id uuid NOT NULL,
        event_type text NOT NULL,
        outcome text NOT NULL,
        processed_at timestamptz NOT NULL DEFAULT current_timestamp,
        PRIMARY KEY (consumer_name, event_id)
      );
    `);
    rabbitConnection = await connect(rabbitmq.getAmqpUrl());
    rabbitChannel = await rabbitConnection.createChannel();
    await assertEventTopology(rabbitChannel);

    return {
      pool,
      rabbitmqUrl: rabbitmq.getAmqpUrl(),
      rabbitChannel,
      async reset() {
        await pool.query(
          "TRUNCATE TABLE outbox_event, consumer_receipt, booking_reminder, booking, resource, service, organization CASCADE",
        );
        await rabbitChannel?.purgeQueue(BOOKING_EVENTS_QUEUE);
        await rabbitChannel?.purgeQueue(BOOKING_EVENTS_RETRY_QUEUE);
        await rabbitChannel?.purgeQueue(BOOKING_EVENTS_DLQ);
        await rabbitChannel?.purgeQueue(ORGANIZATION_REQUEST_EVENTS_QUEUE);
        await rabbitChannel?.purgeQueue(
          ORGANIZATION_REQUEST_EVENTS_RETRY_QUEUE,
        );
        await rabbitChannel?.purgeQueue(ORGANIZATION_REQUEST_EVENTS_DLQ);
        await rabbitChannel?.purgeQueue(PUBLICATION_EVENTS_QUEUE);
        await rabbitChannel?.purgeQueue(PUBLICATION_EVENTS_RETRY_QUEUE);
        await rabbitChannel?.purgeQueue(PUBLICATION_EVENTS_DLQ);
      },
      async stop() {
        await rabbitChannel?.close().catch(() => undefined);
        await rabbitConnection?.close().catch(() => undefined);
        await pool.end();
        // Pool.end() removes idle clients before their sockets finish closing.
        await Promise.all(clientShutdowns);
        await Promise.allSettled([postgres.stop(), rabbitmq.stop()]);
      },
    };
  } catch (error) {
    await rabbitChannel?.close().catch(() => undefined);
    await rabbitConnection?.close().catch(() => undefined);
    await pool.end();
    await Promise.all(clientShutdowns);
    await Promise.allSettled([postgres.stop(), rabbitmq.stop()]);
    throw error;
  }
}
