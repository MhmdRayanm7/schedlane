import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { requireVerifiedUser } from "../../../http/auth-guard.js";
import { collectionRoutes } from "./collection-routes.js";
import { lifecycleRoutes } from "./lifecycle-routes.js";
import { membershipRoutes } from "./membership-routes.js";

export const resourceRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.decorateRequest("verifiedUser");
  app.addHook("preHandler", requireVerifiedUser);

  await app.register(collectionRoutes);
  await app.register(lifecycleRoutes);
  await app.register(membershipRoutes);
};
