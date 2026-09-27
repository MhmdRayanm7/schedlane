import type {
  SendTransactionalEmailInput,
  SendTransactionalEmailResult,
  TransactionalEmailService,
} from "./email-service.js";

export class ConsoleTransactionalEmailService
  implements TransactionalEmailService
{
  async send(
    input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult> {
    console.log(
      `[email] Transactional email prepared idempotencyKey: ${input.idempotencyKey}`,
    );
    return { id: `console-${Date.now()}` };
  }
}
