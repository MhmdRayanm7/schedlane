export type DateOverrideConfiguration = {
  mode: "inherit" | "closed" | "custom";
  intervals: Array<{ startMinute: number; endMinute: number }>;
};

export type OrganizationDateOverride = DateOverrideConfiguration & {
  timezone: "Asia/Jerusalem";
  date: string;
};

export function isLocalDate(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= (daysInMonth[month - 1] ?? 0);
}

export function normalizeDateOverride(
  date: string,
  configuration: DateOverrideConfiguration,
): OrganizationDateOverride | null {
  if (!isLocalDate(date)) return null;
  const { mode } = configuration;
  if (mode === "inherit" || mode === "closed") {
    if (configuration.intervals.length !== 0) return null;
  } else if (mode === "custom") {
    if (configuration.intervals.length === 0) return null;
  } else return null;
  const intervals = configuration.intervals
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.startMinute - b.startMinute);
  let previousEnd = 0;
  for (const { startMinute, endMinute } of intervals) {
    if (
      !Number.isInteger(startMinute) ||
      !Number.isInteger(endMinute) ||
      startMinute < 0 ||
      startMinute >= 1440 ||
      endMinute <= 0 ||
      endMinute > 1440 ||
      startMinute >= endMinute ||
      startMinute < previousEnd
    )
      return null;
    previousEnd = endMinute;
  }
  return { timezone: "Asia/Jerusalem", date, mode, intervals };
}
