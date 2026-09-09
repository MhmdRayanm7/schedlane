import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import { auth } from "../auth.js";

export type VerifiedUser = {
  id: string;
  email: string;
};

declare module "fastify" {
  interface FastifyRequest {
    // Populated by the verified-user preHandler before protected handlers run.
    verifiedUser: VerifiedUser;
  }
}

export async function requireVerifiedUser(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session) {
    return reply.code(401).send({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      requestId: request.id,
    });
  }

  if (!session.user.emailVerified) {
    return reply.code(403).send({
      code: "EMAIL_NOT_VERIFIED",
      message: "Email verification required",
      requestId: request.id,
    });
  }

  request.verifiedUser = {
    id: session.user.id,
    email: session.user.email,
  };
}
