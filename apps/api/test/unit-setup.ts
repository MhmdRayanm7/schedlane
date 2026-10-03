import { vi } from "vitest";

// Unit test setup provides safe test defaults for unit tests importing application
// modules that evaluate src/config.ts without requiring an ambient .env file.
vi.stubEnv(
  "DATABASE_URL",
  "postgresql://schedlane:schedlane@localhost:5432/schedlane",
);
vi.stubEnv("NODE_ENV", "test");
vi.stubEnv("BETTER_AUTH_SECRET", "schedlane-integration-test-secret-only");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
vi.stubEnv("WEB_ORIGIN", "http://localhost:5173");
vi.stubEnv("EMAIL_PROVIDER", "console");
vi.stubEnv(
  "GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY",
  "a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s=",
);
