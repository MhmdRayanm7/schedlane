import { randomInt } from "node:crypto";

export const BOOKING_PUBLIC_REFERENCE_ALPHABET =
  "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const BOOKING_PUBLIC_REFERENCE_RANDOM_LENGTH = 10;

export function generateBookingPublicReference(): string {
  const characters = Array.from(
    { length: BOOKING_PUBLIC_REFERENCE_RANDOM_LENGTH },
    () =>
      BOOKING_PUBLIC_REFERENCE_ALPHABET[
        randomInt(BOOKING_PUBLIC_REFERENCE_ALPHABET.length)
      ],
  );
  return `BK-${characters.join("")}`;
}
