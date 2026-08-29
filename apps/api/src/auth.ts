import { betterAuth } from "better-auth";
import { config } from "./config.js";
import { pool } from "./db.js";

export const auth = betterAuth({
  database: pool,

  secret: config.BETTER_AUTH_SECRET,

  baseURL: config.BETTER_AUTH_URL,

  trustedOrigins: [config.WEB_ORIGIN],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
});
