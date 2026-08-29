import { config } from "../config.js";
import { ConsoleEmailService } from "./console-email-service.js";
import type { EmailService } from "./email-service.js";
import { ResendEmailService } from "./resend-email-service.js";

function createEmailService(): EmailService {
  if (config.EMAIL_PROVIDER === "console") {
    return new ConsoleEmailService();
  }

  if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend",
    );
  }

  return new ResendEmailService({
    apiKey: config.RESEND_API_KEY,
    from: config.EMAIL_FROM,
  });
}

export const emailService = createEmailService();
