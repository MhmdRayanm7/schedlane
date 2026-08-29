export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailService {
  send(input: SendEmailInput): Promise<void>;
}
