export function redactBookingShareTokenFromUrl(url: string): string {
  return url.replace(/([?&]share=)[^&]*/g, "$1[REDACTED]");
}
