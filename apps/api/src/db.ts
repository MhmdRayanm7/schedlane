import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { config } from "./config.js";

type Database = Record<never, never>;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool,
  }),
});
