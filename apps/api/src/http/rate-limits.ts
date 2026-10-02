import type { FastifyRequest } from "fastify";
import { config } from "../config.js";

export const rateLimitPluginOptions = {
  global: false,
  errorResponseBuilder(request: FastifyRequest) {
    return {
      statusCode: 429,
      code: "RATE_LIMITED",
      error: "Too Many Requests",
      message: "Too many requests. Please wait a moment and try again.",
      requestId: request.id,
    };
  },
} as const;

export const publicReadRateLimit = {
  max: config.PUBLIC_READ_RATE_LIMIT_MAX,
  timeWindow: "1 minute",
} as const;

export const publicWriteRateLimit = {
  max: config.PUBLIC_WRITE_RATE_LIMIT_MAX,
  timeWindow: "10 minutes",
} as const;
