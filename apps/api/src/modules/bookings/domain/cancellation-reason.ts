export function normalizeCancellationReason(
  reason: string | null | undefined,
): string | null {
  return reason?.trim() || null;
}
