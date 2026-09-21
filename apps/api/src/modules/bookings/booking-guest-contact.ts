import { parsePhoneNumberFromString } from "libphonenumber-js";

type GuestNameNormalizationResult =
  | { ok: true; guestName: string }
  | { ok: false; reason: "invalid_guest_name" };

type GuestPhoneNormalizationResult =
  | { ok: true; guestPhone: string }
  | { ok: false; reason: "invalid_guest_phone" };

type OptionalGuestPhoneNormalizationResult =
  | { ok: true; guestPhone: string | null }
  | { ok: false; reason: "invalid_guest_phone" };

export function normalizeGuestName(
  guestName: string,
): GuestNameNormalizationResult {
  const normalized = guestName.trim();
  return normalized === ""
    ? { ok: false, reason: "invalid_guest_name" }
    : { ok: true, guestName: normalized };
}

function normalizeIsraeliInternationalPrefix(value: string): string {
  if (value.startsWith("00972")) return `+${value.slice(2)}`;
  if (value.startsWith("972")) return `+${value}`;
  return value;
}

export function normalizeIsraeliGuestPhone(
  guestPhone: string,
): GuestPhoneNormalizationResult {
  const input = normalizeIsraeliInternationalPrefix(guestPhone.trim());
  const phone = parsePhoneNumberFromString(input, "IL");
  if (phone?.country !== "IL" || !phone.isValid())
    return { ok: false, reason: "invalid_guest_phone" };
  return { ok: true, guestPhone: phone.number };
}

export function normalizeOptionalIsraeliGuestPhone(
  guestPhone: string | null | undefined,
): OptionalGuestPhoneNormalizationResult {
  if (guestPhone == null || guestPhone.trim() === "")
    return { ok: true, guestPhone: null };
  return normalizeIsraeliGuestPhone(guestPhone);
}

export function normalizeGuestEmail(
  guestEmail: string | null | undefined,
): string | null {
  return guestEmail?.trim() || null;
}
