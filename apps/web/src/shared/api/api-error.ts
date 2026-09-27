export type ApiErrorDetails = {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details: Record<string, unknown>;

  constructor({ status, code, message, requestId, details }: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details ?? {};
  }
}
