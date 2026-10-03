import { betterAuth } from "better-auth";
import { config } from "../../config.js";
import { pool } from "../../db.js";
import { emailService } from "../../email/index.js";
import { renderVerificationEmail } from "./verification-email.js";

export const auth = betterAuth({
  database: pool,

  secret: config.BETTER_AUTH_SECRET,

  baseURL: config.BETTER_AUTH_URL,

  trustedOrigins: [config.WEB_ORIGIN],

  // Better Auth owns auth-specific IP throttling and its stricter sign-in and
  // sign-up rules; keeping it here avoids double-limiting session navigation.
  rateLimit: {
    enabled: config.NODE_ENV === "production",
  },

  emailVerification: {
    sendOnSignUp: true,

    sendVerificationEmail: async ({ user, url }) => {
      void emailService
        .send(renderVerificationEmail(user.email, url))
        .catch(() => {
          console.error("Failed to send verification email");
        });
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
});
