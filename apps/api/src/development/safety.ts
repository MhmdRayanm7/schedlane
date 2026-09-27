import { config } from "../config.js";

export class DevEnvironmentSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevEnvironmentSafetyError";
  }
}

const LOCAL_DATABASE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

const EXPECTED_DATABASE_NAME = "schedlane";

export function assertSafeDevelopmentEnvironment(options?: {
  nodeEnv?: string;
  databaseUrl?: string;
}): void {
  const nodeEnv =
    options && "nodeEnv" in options
      ? options.nodeEnv
      : (process.env.NODE_ENV ?? config.NODE_ENV);

  if (nodeEnv !== "development") {
    throw new DevEnvironmentSafetyError(
      `Development reset tooling is restricted to local development environments only. Expected NODE_ENV='development', got '${nodeEnv}'.`,
    );
  }

  const rawUrl =
    options && "databaseUrl" in options
      ? options.databaseUrl
      : (process.env.DATABASE_URL ?? config.DATABASE_URL);

  if (!rawUrl) {
    throw new DevEnvironmentSafetyError(
      "DATABASE_URL is not configured. Aborting development operation.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DevEnvironmentSafetyError(
      `DATABASE_URL '${rawUrl}' is not a valid URL. Aborting development operation.`,
    );
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new DevEnvironmentSafetyError(
      `DATABASE_URL protocol must be postgres: or postgresql:, got '${parsed.protocol}'. Aborting development operation.`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new DevEnvironmentSafetyError(
      `Destructive development operation refused: DATABASE_URL host '${parsed.hostname}' is not a recognized local development host (expected localhost, 127.0.0.1, or ::1).`,
    );
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  if (databaseName !== EXPECTED_DATABASE_NAME) {
    throw new DevEnvironmentSafetyError(
      `Destructive development operation refused: DATABASE_URL database '${databaseName}' does not match expected development database '${EXPECTED_DATABASE_NAME}'.`,
    );
  }
}
