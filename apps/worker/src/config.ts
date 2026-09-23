import { fileURLToPath } from "node:url";
import { envSchema } from "env-schema";
import Type from "typebox";

const configSchema = Type.Object({
  DATABASE_URL: Type.String({ minLength: 1 }),
  RABBITMQ_URL: Type.String({ minLength: 1 }),
  OUTBOX_BATCH_SIZE: Type.Integer({ default: 25, minimum: 1 }),
  OUTBOX_POLL_INTERVAL_MS: Type.Integer({ default: 1000, minimum: 10 }),
  RABBITMQ_RECONNECT_DELAY_MS: Type.Integer({ default: 1000, minimum: 10 }),
});

export type Config = Type.Static<typeof configSchema>;

const envPath = fileURLToPath(new URL("../.env", import.meta.url));

export const config = envSchema<Config>({
  schema: configSchema,
  dotenv: { path: envPath },
});
