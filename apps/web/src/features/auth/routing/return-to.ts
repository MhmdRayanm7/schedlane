export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "/app";

  const isAppPath = value === "/app" || value.startsWith("/app/");
  const containsUnsafeSeparator = value.includes("\\");

  return isAppPath && !containsUnsafeSeparator ? value : "/app";
}
