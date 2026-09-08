import { afterAll, beforeEach, vi } from "vitest";
import { startTestDatabase } from "./helpers/test-database.js";

const testDatabase = await startTestDatabase();

// setupFiles completes before test modules (and their service imports) are loaded.
// Explicit test values take precedence over the API's dotenv configuration.
vi.stubEnv("DATABASE_URL", testDatabase.databaseUrl);
vi.stubEnv("NODE_ENV", "test");
vi.stubEnv("BETTER_AUTH_SECRET", "schedlane-integration-test-secret-only");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
vi.stubEnv("WEB_ORIGIN", "http://localhost:5173");
vi.stubEnv("EMAIL_PROVIDER", "console");

try {
  const { db } = await import("../src/db.js");

  beforeEach(() => testDatabase.reset());
  afterAll(async () => {
    try {
      await db.destroy();
    } finally {
      try {
        await testDatabase.stop();
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });
} catch (error) {
  try {
    await testDatabase.stop();
  } finally {
    vi.unstubAllEnvs();
  }
  throw error;
}
