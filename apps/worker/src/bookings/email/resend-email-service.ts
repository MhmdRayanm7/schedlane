import { Resend } from "resend";
import type {
  SendTransactionalEmailInput,
  SendTransactionalEmailResult,
  TransactionalEmailService,
} from "./email-service.js";

export interface ResendTransactionalEmailServiceOptions {
  apiKey: string;
  from: string;
}

export class ResendTransactionalEmailService
  implements TransactionalEmailService
{
  private readonly resend: Resend;
  private readonly from: string;

  constructor(options: ResendTransactionalEmailServiceOptions) {
    this.resend = new Resend(options.apiKey);
    this.from = options.from;
  }

  async send(
    input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult> {
    const { data, error } = await this.resend.emails.send(
      {
        from: this.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        headers: {
          "Idempotency-Key": input.idempotencyKey,
        },
      },
      {
        headers: {
          "Idempotency-Key": input.idempotencyKey,
        },
      },
    );

    if (error) {
      throw new Error(`Resend failed to send email: ${error.message}`);
    }

    return { id: data?.id };
  }
}
