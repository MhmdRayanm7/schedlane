import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { requireVerifiedUser } from "../../../http/auth-guard.js";
import { assignmentRoutes } from "./assignment-routes.js";
import { catalogRoutes } from "./catalog-routes.js";

export const serviceRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.decorateRequest("verifiedUser");
  app.addHook("preHandler", requireVerifiedUser);

  await app.register(assignmentRoutes);
  await app.register(catalogRoutes);
};
