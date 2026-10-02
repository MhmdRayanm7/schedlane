type WorkerConfig = {
  NODE_ENV: "development" | "test" | "production";
  EMAIL_PROVIDER?: "console" | "resend";
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY?: string;
  GUEST_BOOKING_MANAGEMENT_URL?: string;
  APP_BASE_URL?: string;
};

function assertHttpUrl(name: string, value: string | undefined): void {
  if (!value) throw new Error(`${name} is required in production`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
}

function hasValidEncryptionKey(value: string | undefined): boolean {
  if (!value) return false;
  return Buffer.from(value, "base64").length === 32;
}

export function assertWorkerConfig(config: WorkerConfig): void {
  if (config.NODE_ENV !== "production") return;

  if (config.EMAIL_PROVIDER !== "resend") {
    throw new Error("Production requires EMAIL_PROVIDER=resend");
  }
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend",
    );
  }
  if (!hasValidEncryptionKey(config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY)) {
    throw new Error(
      "Production requires GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY as a base64-encoded 32-byte key",
    );
  }
  assertHttpUrl("APP_BASE_URL", config.APP_BASE_URL);
  assertHttpUrl(
    "GUEST_BOOKING_MANAGEMENT_URL",
    config.GUEST_BOOKING_MANAGEMENT_URL,
  );
}
