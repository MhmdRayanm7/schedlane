export const apiBaseUrl = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL as
  | string
  | undefined;
