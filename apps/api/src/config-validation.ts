type ApiProductionConfig = {
  NODE_ENV: "development" | "test" | "production";
  EMAIL_PROVIDER: "console" | "resend";
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  BETTER_AUTH_URL: string;
  WEB_ORIGIN: string;
};

function assertHttpUrl(name: string, value: string): void {
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

export function assertApiConfig(config: ApiProductionConfig): void {
  assertHttpUrl("BETTER_AUTH_URL", config.BETTER_AUTH_URL);
  assertHttpUrl("WEB_ORIGIN", config.WEB_ORIGIN);

  if (config.NODE_ENV === "production" && config.EMAIL_PROVIDER !== "resend") {
    throw new Error("Production requires EMAIL_PROVIDER=resend");
  }
  if (
    config.EMAIL_PROVIDER === "resend" &&
    (!config.RESEND_API_KEY || !config.EMAIL_FROM)
  ) {
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend",
    );
  }
}
