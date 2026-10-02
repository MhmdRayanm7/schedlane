import type { FastifyInstance } from "fastify";

export function registerSafeErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      code: "NOT_FOUND",
      message: "Route not found",
      requestId: request.id,
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    const fastifyError = error as {
      validation?: unknown;
      statusCode?: number;
    };
    if (fastifyError.validation) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "Invalid request",
        requestId: request.id,
      });
    }

    const status = fastifyError.statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply.code(status).send({
        code: "REQUEST_ERROR",
        message: "The request could not be completed",
        requestId: request.id,
      });
    }

    request.log.error({ err: error }, "Unhandled API request error");
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
      requestId: request.id,
    });
  });
}
