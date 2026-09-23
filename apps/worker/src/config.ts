import { fileURLToPath } from "node:url";
import { envSchema } from "env-schema";
import Type from "typebox";

const configSchema = Type.Object({
  DATABASE_URL: Type.String({ minLength: 1 }),
  RABBITMQ_URL: Type.String({ minLength: 1 }),
  OUTBOX_BATCH_SIZE: Type.Integer({ default: 25, minimum: 1 }),
  OUTBOX_POLL_INTERVAL_MS: Type.Integer({ default: 1000, minimum: 10 }),
  RABBITMQ_RECONNECT_DELAY_MS: Type.Integer({ default: 1000, minimum: 10 }),
  BOOKING_EVENT_PREFETCH: Type.Integer({ default: 5, minimum: 1 }),
  BOOKING_EVENT_RETRY_DELAY_MS: Type.Integer({ default: 5000, minimum: 100 }),
  BOOKING_EVENT_MAX_ATTEMPTS: Type.Integer({ default: 5, minimum: 1 }),
  GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY: Type.Optional(
    Type.String({ minLength: 1 }),
  ),
  GUEST_BOOKING_MANAGEMENT_URL: Type.Optional(Type.String({ minLength: 1 })),
  EMAIL_PROVIDER: Type.Optional(
    Type.Union([Type.Literal("console"), Type.Literal("resend")], {
      default: "console",
    }),
  ),
  RESEND_API_KEY: Type.Optional(Type.String({ minLength: 1 })),
  EMAIL_FROM: Type.Optional(Type.String({ minLength: 1 })),
});

export type Config = Type.Static<typeof configSchema>;

const envPath = fileURLToPath(new URL("../.env", import.meta.url));

export const config = envSchema<Config>({
  schema: configSchema,
  dotenv: { path: envPath },
});
