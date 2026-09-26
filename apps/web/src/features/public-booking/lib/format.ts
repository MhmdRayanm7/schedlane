import { DateTime } from "luxon";

const zone = "Asia/Jerusalem";

export function formatPrice(agorot: number | null) {
  return agorot === null
    ? null
    : `₪${new Intl.NumberFormat("en-IL", { maximumFractionDigits: 2 }).format(agorot / 100)}`;
}

export function formatTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function formatLocalDate(
  date: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  },
) {
  return DateTime.fromISO(date, { zone })
    .setLocale("en")
    .toLocaleString(options);
}

export function formatInstant(instant: string) {
  return DateTime.fromISO(instant, { setZone: true })
    .setZone(zone)
    .setLocale("en")
    .toFormat("cccc, d LLLL · HH:mm");
}

export function formatDeadline(instant: string) {
  return DateTime.fromISO(instant, { setZone: true })
    .setZone(zone)
    .setLocale("en")
    .toFormat("d LLLL 'at' HH:mm");
}

export function upcomingDates(
  firstDate: string,
  lastDate: string,
  selectedDate: string,
) {
  const first = DateTime.fromISO(firstDate, { zone });
  const last = DateTime.fromISO(lastDate, { zone });
  const selected = DateTime.fromISO(selectedDate, { zone });
  const start = selected.diff(first, "days").days > 5 ? selected : first;
  return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }))
    .filter((date) => date <= last)
    .map((date) => date.toISODate())
    .filter((date): date is string => date !== null);
}
