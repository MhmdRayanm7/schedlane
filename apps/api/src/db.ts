import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";
import { config } from "./config.js";
import type { Database } from "./db-types.js";

// DATE represents a local calendar date, never a JavaScript timestamp.
types.setTypeParser(types.builtins.DATE, (value) => value);

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool,
  }),
});
