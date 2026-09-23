import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import { type Channel, type ChannelModel, connect } from "amqplib";
import { Pool } from "pg";
import {
  assertEventTopology,
  BOOKING_EVENTS_DLQ,
  BOOKING_EVENTS_QUEUE,
  BOOKING_EVENTS_RETRY_QUEUE,
} from "../../src/messaging/topology.js";

export async function startWorkerTestInfrastructure() {
  const [postgres, rabbitmq] = await Promise.all([
    new PostgreSqlContainer("postgres:18")
      .withDatabase("schedlane_worker_test")
      .withUsername("schedlane_worker_test")
      .withPassword("integration-test-only")
      .withStartupTimeout(120_000)
      .start(),
    new RabbitMQContainer("rabbitmq:4-management").start(),
  ]);
  const pool = new Pool({ connectionString: postgres.getConnectionUri() });
  let rabbitConnection: ChannelModel | undefined;
  let rabbitChannel: Channel | undefined;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organization (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL,
        timezone text NOT NULL DEFAULT 'Asia/Jerusalem'
      );

      CREATE TABLE IF NOT EXISTS service (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES organization(id),
        name text NOT NULL,
        slug text NOT NULL,
        duration_minutes integer NOT NULL,
        price_agorot integer NULL
      );

      CREATE TABLE IF NOT EXISTS booking (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL REFERENCES organization(id),
        service_id uuid NOT NULL REFERENCES service(id),
        public_reference text NOT NULL,
        status text NOT NULL,
        start_at timestamptz NOT NULL,
        end_at timestamptz NOT NULL,
        guest_name text NOT NULL,
        guest_email text NULL,
        guest_phone text NULL,
        guest_management_token_hash text NULL,
        guest_management_token_encrypted text NULL,
        created_at timestamptz NOT NULL DEFAULT current_timestamp
      );

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
          "TRUNCATE TABLE outbox_event, consumer_receipt, booking, service, organization CASCADE",
        );
        await rabbitChannel?.purgeQueue(BOOKING_EVENTS_QUEUE);
        await rabbitChannel?.purgeQueue(BOOKING_EVENTS_RETRY_QUEUE);
        await rabbitChannel?.purgeQueue(BOOKING_EVENTS_DLQ);
      },
      async stop() {
        await rabbitChannel?.close().catch(() => undefined);
        await rabbitConnection?.close().catch(() => undefined);
        await pool.end();
        await Promise.allSettled([postgres.stop(), rabbitmq.stop()]);
      },
    };
  } catch (error) {
    await rabbitChannel?.close().catch(() => undefined);
    await rabbitConnection?.close().catch(() => undefined);
    await pool.end();
    await Promise.allSettled([postgres.stop(), rabbitmq.stop()]);
    throw error;
  }
}
