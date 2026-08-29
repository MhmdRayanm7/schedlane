import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import { auth } from "./auth.js";
import { config } from "./config.js";

export function registerAuthRoutes(app: FastifyInstance): void {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",

    async handler(request, reply) {
      const url = new URL(request.url, config.BETTER_AUTH_URL);

      const headers = fromNodeHeaders(request.headers);

      const authRequest = new Request(url, {
        method: request.method,
        headers,
        ...(request.body
          ? {
              body: JSON.stringify(request.body),
            }
          : {}),
      });

      const response = await auth.handler(authRequest);

      reply.status(response.status);

      for (const [name, value] of response.headers) {
        if (name !== "set-cookie") {
          reply.header(name, value);
        }
      }

      const cookies = response.headers.getSetCookie();

      if (cookies.length > 0) {
        reply.header("set-cookie", cookies);
      }

      const body = response.body ? await response.text() : null;

      return reply.send(body);
    },
  });
}
