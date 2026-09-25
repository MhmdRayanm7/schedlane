import cors from "@fastify/cors";
import Fastify from "fastify";
import { sql } from "kysely";
import { config } from "./config.js";
import { db } from "./db.js";
import { registerAuthRoutes } from "./modules/auth/http/routes.js";
import { availabilityRoutes } from "./modules/availability/http/management-routes.js";
import { publicAvailabilityRoutes } from "./modules/availability/http/public-routes.js";
import { bookingRoutes } from "./modules/bookings/http/management-routes.js";
import { publicBookingRoutes } from "./modules/bookings/http/public-routes.js";
import { organizationRoutes } from "./modules/organizations/http/index.js";
import { resourceRoutes } from "./modules/resources/http/index.js";
import { serviceRoutes } from "./modules/services/http/index.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: config.WEB_ORIGIN,
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
});

registerAuthRoutes(app);

await app.register(organizationRoutes);
await app.register(resourceRoutes);
await app.register(serviceRoutes);
await app.register(availabilityRoutes);
await app.register(bookingRoutes);
await app.register(publicAvailabilityRoutes);
await app.register(publicBookingRoutes);

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
