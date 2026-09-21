export function cloneValidOperationTime(
  now: Date,
  invalidMessage: string,
): Date {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error(invalidMessage);
  return new Date(now.getTime());
}
