import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = await buildApp();
let shutdownStarted = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  app.log.info({ signal }, "API shutdown requested");
  try {
    await app.close();
  } catch (error) {
    app.log.error({ err: error }, "API shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error({ err: error }, "API startup failed");
  await app.close();
  process.exitCode = 1;
}
