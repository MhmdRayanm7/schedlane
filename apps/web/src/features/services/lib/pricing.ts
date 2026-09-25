/**
 * Converts an ILS string or number input to integer agorot without floating point errors.
 * Returns null if the value is empty, null, or undefined.
 */
export function ilsToAgorot(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (Number.isNaN(value) || value < 0) return null;
    return Math.round(value * 100);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number.parseFloat(trimmed);
  if (Number.isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

/**
 * Converts integer agorot to an ILS string for form input display.
 */
export function agorotToIls(agorot: number | null | undefined): string {
  if (agorot === null || agorot === undefined) return "";
  const ils = agorot / 100;
  return ils % 1 === 0 ? ils.toString() : ils.toFixed(2);
}

/**
 * Formats integer agorot as Israeli Shekel currency symbol (₪).
 */
export function formatPriceIls(
  agorot: number | null | undefined,
): string | null {
  if (agorot === null || agorot === undefined) return null;
  const ils = agorot / 100;
  const formatted = ils % 1 === 0 ? ils.toLocaleString() : ils.toFixed(2);
  return `₪${formatted}`;
}

/**
 * Formats a duration in minutes into a human-readable string.
 */
export function formatDuration(durationMinutes: number): string {
  if (durationMinutes <= 0) return "0 min";
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return hours === 1 ? "1 hr" : `${hours} hrs`;
  return `${hours} hr ${minutes} min`;
}
