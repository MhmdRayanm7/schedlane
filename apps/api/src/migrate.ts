import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { db } from "./db.js";

const migrationFolder = fileURLToPath(new URL("./migrations", import.meta.url));

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder,
    import: (modulePath) => import(pathToFileURL(modulePath).href),
  }),
});

const { error, results } = await migrator.migrateToLatest();

for (const result of results ?? []) {
  if (result.status === "Success") {
    console.log(`Migration "${result.migrationName}" completed`);
  } else if (result.status === "Error") {
    console.error(`Migration "${result.migrationName}" failed`);
  }
}

if (error) {
  console.error("Database migration failed", error);
  process.exitCode = 1;
}

await db.destroy();
