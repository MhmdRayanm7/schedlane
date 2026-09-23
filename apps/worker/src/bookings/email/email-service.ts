export interface SendTransactionalEmailInput {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export interface SendTransactionalEmailResult {
  id?: string | undefined;
}

export interface TransactionalEmailService {
  send(
    input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult>;
}
