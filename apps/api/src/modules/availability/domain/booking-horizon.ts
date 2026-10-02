export const MAX_BOOKING_HORIZON_DAYS = 365;

export function isBookingHorizonDays(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_BOOKING_HORIZON_DAYS
  );
}
