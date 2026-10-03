export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailService {
  send(input: SendEmailInput): Promise<void>;
}
