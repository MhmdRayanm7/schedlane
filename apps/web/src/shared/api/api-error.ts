export type ApiErrorDetails = {
  status: number;
  code: string;
  message: string;
  requestId?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor({ status, code, message, requestId }: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}
