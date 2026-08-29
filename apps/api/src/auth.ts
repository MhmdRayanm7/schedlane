import { betterAuth } from "better-auth";
import { config } from "./config.js";
import { pool } from "./db.js";
import { emailService } from "./email/index.js";

export const auth = betterAuth({
  database: pool,

  secret: config.BETTER_AUTH_SECRET,

  baseURL: config.BETTER_AUTH_URL,

  trustedOrigins: [config.WEB_ORIGIN],

  emailVerification: {
    sendOnSignUp: true,

    sendVerificationEmail: async ({ user, url }) => {
      void emailService
        .send({
          to: user.email,
          subject: "Verify your Schedlane email",
          text: `Verify your email by opening this link:\n${url}`,
        })
        .catch((error) => {
          console.error("Failed to send verification email", error);
        });
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
});
