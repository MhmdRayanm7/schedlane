import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const result = spawnSync("pnpm --filter @schedlane/api db:fixtures:info", {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 0);
