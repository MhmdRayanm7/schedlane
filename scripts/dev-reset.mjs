import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const apiEnvPath = path.join(repoRoot, "apps", "api", ".env");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let val = trimmed.slice(equalsIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const fileEnv = loadEnvFile(apiEnvPath);
const nodeEnv = process.env.NODE_ENV ?? fileEnv.NODE_ENV ?? "development";
// biome-ignore lint/suspicious/noUndeclaredEnvVars: dev-reset is a standalone development script
const databaseUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;

function validateSafety() {
  if (nodeEnv !== "development") {
    console.error(
      `\n❌ DESTRUCTIVE RESET ABORTED: NODE_ENV must be 'development', got '${nodeEnv}'.\n`,
    );
    process.exit(1);
  }

  if (!databaseUrl) {
    console.error(
      "\n❌ DESTRUCTIVE RESET ABORTED: DATABASE_URL is not defined in environment or apps/api/.env.\n",
    );
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    console.error(
      `\n❌ DESTRUCTIVE RESET ABORTED: DATABASE_URL '${databaseUrl}' is not a valid URL.\n`,
    );
    process.exit(1);
  }

  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    console.error(
      `\n❌ DESTRUCTIVE RESET ABORTED: DATABASE_URL host '${parsed.hostname}' is not a recognized local development host (localhost, 127.0.0.1, ::1).\n`,
    );
    process.exit(1);
  }

  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName !== "schedlane") {
    console.error(
      `\n❌ DESTRUCTIVE RESET ABORTED: DATABASE_URL database '${dbName}' does not match expected development database 'schedlane'.\n`,
    );
    process.exit(1);
  }
}

function run(command, args) {
  const fullCommand = `${command} ${args.join(" ")}`;
  console.log(`\n> ${fullCommand}`);
  const result = spawnSync(fullCommand, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      DATABASE_URL: databaseUrl,
      EMAIL_PROVIDER: "console",
    },
  });
  if (result.status !== 0) {
    console.error(`Command failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

// 1. Verify safety guard
validateSafety();
console.log("Safe local development environment confirmed.");

// 2. Shut down repository Compose stack and remove repository volumes
run("docker", ["compose", "down", "-v", "--remove-orphans"]);

// 3. Start Postgres + RabbitMQ and wait until healthy
run("docker", ["compose", "up", "-d", "--wait"]);

// 4. Run all migrations
run("pnpm", ["--filter", "@schedlane/api", "db:migrate"]);

// 5. Seed development fixtures and print test matrix
run("pnpm", ["--filter", "@schedlane/api", "db:seed:fixtures"]);

console.log("\n✅ Schedlane development environment reset successfully.\n");
