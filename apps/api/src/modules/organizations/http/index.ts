import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { requireVerifiedUser } from "../../../http/auth-guard.js";
import { accessRoutes } from "./access-routes.js";
import { invitationRoutes } from "./invitation-routes.js";
import { membershipRoutes } from "./membership-routes.js";
import { platformRoutes } from "./platform-routes.js";
import { requestRoutes } from "./request-routes.js";

export const organizationRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.decorateRequest("verifiedUser");
  app.addHook("preHandler", requireVerifiedUser);

  await app.register(platformRoutes);
  await app.register(requestRoutes);
  await app.register(accessRoutes);
  await app.register(membershipRoutes);
  await app.register(invitationRoutes);
};
