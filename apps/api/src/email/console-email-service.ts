import type { EmailService, SendEmailInput } from "./email-service.js";
//local development
export class ConsoleEmailService implements EmailService {
  async send(input: SendEmailInput): Promise<void> {
    console.log("Development email");
    console.log(`To: ${input.to}`);
    console.log(`Subject: ${input.subject}`);
    console.log(input.text);
  }
}
