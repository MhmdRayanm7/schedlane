import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import { type Channel, type ChannelModel, connect } from "amqplib";
import { Pool } from "pg";
import {
  assertEventTopology,
  BOOKING_EVENTS_QUEUE,
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
      CREATE TABLE outbox_event (
        id uuid PRIMARY KEY DEFAULT uuidv7(),
        aggregate_type text NOT NULL,
        aggregate_id uuid NOT NULL,
        event_type text NOT NULL,
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL,
        published_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT current_timestamp
      )
    `);
    rabbitConnection = await connect(rabbitmq.getAmqpUrl());
    rabbitChannel = await rabbitConnection.createChannel();
    await assertEventTopology(rabbitChannel);

    return {
      pool,
      rabbitmqUrl: rabbitmq.getAmqpUrl(),
      rabbitChannel,
      async reset() {
        await pool.query("TRUNCATE TABLE outbox_event");
        await rabbitChannel?.purgeQueue(BOOKING_EVENTS_QUEUE);
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
