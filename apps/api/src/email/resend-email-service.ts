import { Resend } from "resend";
import type { EmailService, SendEmailInput } from "./email-service.js";

type ResendEmailServiceOptions = {
  apiKey: string;
  from: string;
};

export class ResendEmailService implements EmailService {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(options: ResendEmailServiceOptions) {
    this.resend = new Resend(options.apiKey);
    this.from = options.from;
  }

  async send(input: SendEmailInput): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    if (error) {
      throw new Error(`Resend failed to send email: ${error.message}`);
    }
  }
}
