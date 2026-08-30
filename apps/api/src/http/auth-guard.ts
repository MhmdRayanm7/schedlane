import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import { auth } from "../auth.js";

type VerifiedUser = {
  id: string;
  email: string;
};

export async function requireVerifiedUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<VerifiedUser | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session) {
    await reply.code(401).send({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      requestId: request.id,
    });

    return null;
  }

  if (!session.user.emailVerified) {
    await reply.code(403).send({
      code: "EMAIL_NOT_VERIFIED",
      message: "Email verification required",
      requestId: request.id,
    });

    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
  };
}
