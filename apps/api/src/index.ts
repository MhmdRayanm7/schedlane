import cors from "@fastify/cors";
import Fastify from "fastify";
import { sql } from "kysely";
import { registerAuthRoutes } from "./auth-routes.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { organizationRoutes } from "./modules/organizations/routes/index.js";
import { resourceRoutes } from "./modules/resources/resource-routes.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: config.WEB_ORIGIN,
  credentials: true,
});

registerAuthRoutes(app);

await app.register(organizationRoutes);
await app.register(resourceRoutes);

app.get("/health/live", async () => {
  return {
    status: "ok",
  };
});

app.get("/health/ready", async (_request, reply) => {
  try {
    await sql`select 1`.execute(db);

    return {
      status: "ok",
    };
  } catch (error) {
    app.log.error(
      {
        err: error,
      },
      "Database readiness check failed",
    );

    return reply.code(503).send({
      status: "unavailable",
    });
  }
});

await app.listen({
  host: config.HOST,
  port: config.PORT,
});
