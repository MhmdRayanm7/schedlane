import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import { sql } from "kysely";
import { config } from "./config.js";
import { db } from "./db.js";
import { registerSafeErrorHandlers } from "./http/error-handlers.js";
import { registerHealthRoutes } from "./http/health-routes.js";
import { rateLimitPluginOptions } from "./http/rate-limits.js";
import { redactBookingShareTokenFromUrl } from "./http/redact-public-locator.js";
import { registerAuthRoutes } from "./modules/auth/http/routes.js";
import { availabilityRoutes } from "./modules/availability/http/management-routes.js";
import { publicAvailabilityRoutes } from "./modules/availability/http/public-routes.js";
import { bookingRoutes } from "./modules/bookings/http/management-routes.js";
import { publicBookingRoutes } from "./modules/bookings/http/public-routes.js";
import { bookingShareLinkRoutes } from "./modules/bookings/http/share-link-routes.js";
import { organizationRoutes } from "./modules/organizations/http/index.js";
import { resourceRoutes } from "./modules/resources/http/index.js";
import { serviceRoutes } from "./modules/services/http/index.js";

export async function buildApp(
  options: Pick<FastifyServerOptions, "logger"> = {},
) {
  const app = Fastify({
    logger: options.logger ?? {
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: redactBookingShareTokenFromUrl(request.url),
            host: request.host,
            remoteAddress: request.ip,
            ...(request.socket.remotePort !== undefined
              ? { remotePort: request.socket.remotePort }
              : {}),
          };
        },
      },
    },
  });

  registerSafeErrorHandlers(app);

  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
  });

  await app.register(rateLimit, rateLimitPluginOptions);

  registerAuthRoutes(app);
  await app.register(organizationRoutes);
  await app.register(resourceRoutes);
  await app.register(serviceRoutes);
  await app.register(availabilityRoutes);
  await app.register(bookingRoutes);
  await app.register(bookingShareLinkRoutes);
  await app.register(publicAvailabilityRoutes);
  await app.register(publicBookingRoutes);

  registerHealthRoutes(app, async () => {
    await sql`select 1`.execute(db);
  });

  app.addHook("onClose", async () => {
    await db.destroy();
  });

  return app;
}
