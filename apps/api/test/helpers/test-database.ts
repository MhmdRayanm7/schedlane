import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { Pool } from "pg";
import type { Database } from "../../src/db-types.js";

export async function startTestDatabase() {
  // Always create a fresh container with a random host port, never an ambient URL.
  const container = await new PostgreSqlContainer("postgres:18")
    .withDatabase("schedlane_test")
    .withUsername("schedlane_test")
    .withPassword("integration-test-only")
    .withStartupTimeout(120_000)
    .start();
  const databaseUrl = container.getConnectionUri();
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: databaseUrl, max: 1 }),
    }),
  });

  async function stop() {
    try {
      await db.destroy();
    } finally {
      await container.stop();
    }
  }

  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: fileURLToPath(
          new URL("../../src/migrations", import.meta.url),
        ),
        import: (modulePath) => import(pathToFileURL(modulePath).href),
      }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;

    // Discover migrated tables so reset also covers auth tables and future migrations.
    // Migration bookkeeping is retained; this connection belongs only to our container.
    const tables = await db.introspection.getTables();
    const tableNames = tables
      .filter((table) => table.schema === "public" && !table.isView)
      .map((table) => sql.id("public", table.name));

    return {
      databaseUrl,
      async reset() {
        await sql`TRUNCATE TABLE ${sql.join(tableNames)} RESTART IDENTITY CASCADE`.execute(
          db,
        );
      },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
