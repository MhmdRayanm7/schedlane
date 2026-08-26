import { fileURLToPath } from "node:url";
import { envSchema } from "env-schema";
import Type from "typebox";

const configSchema = Type.Object({
  NODE_ENV: Type.Union(
    [
      Type.Literal("development"),
      Type.Literal("test"),
      Type.Literal("production"),
    ],
    { default: "development" },
  ),

  HOST: Type.String({
    default: "0.0.0.0",
  }),

  PORT: Type.Number({
    default: 3000,
    minimum: 1,
    maximum: 65535,
  }),

  DATABASE_URL: Type.String({
    minLength: 1,
  }),
});

export type Config = Type.Static<typeof configSchema>;

const envPath = fileURLToPath(new URL("../.env", import.meta.url));

export const config = envSchema<Config>({
  schema: configSchema,
  dotenv: {
    path: envPath,
  },
});
