import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(
  app: FastifyInstance,
  checkDatabase: () => Promise<void>,
): void {
  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await checkDatabase();
      return { status: "ok" };
    } catch (error) {
      app.log.error({ err: error }, "Database readiness check failed");
      return reply.code(503).send({ status: "unavailable" });
    }
  });
}
