import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { GuestDetails, PublicService } from "../types";

export type BookingStep =
  | "service"
  | "resource"
  | "dateTime"
  | "details"
  | "review";

export type GuestField = "guestName" | "guestPhone" | "guestEmail";
export type GuestFieldErrors = Partial<Record<GuestField, string>>;

export const bookingStepLabels: Record<BookingStep, string> = {
  service: "Service",
  resource: "Resource",
  dateTime: "Date & time",
  details: "Your details",
  review: "Review",
};

export const bookingStepDescriptions: Record<BookingStep, string> = {
  service: "What would you like to book?",
  resource: "Choose who or what you’re booking with.",
  dateTime: "Find a date and a time that suits you.",
  details: "How can we reach you about this booking?",
  review: "Check everything before confirming your booking.",
};

export function visibleBookingSteps(
  services: PublicService[],
  serviceId: string,
): BookingStep[] {
  const service =
    services.find((item) => item.id === serviceId) ??
    (services.length === 1 ? services[0] : undefined);
  return [
    ...(services.length > 1 ? (["service"] as const) : []),
    ...(service && service.resources.length > 1 ? (["resource"] as const) : []),
    "dateTime",
    "details",
    "review",
  ];
}

export function initialBookingSelection(services: PublicService[]) {
  const serviceId = services.length === 1 ? (services[0]?.id ?? "") : "";
  const service = services.find((item) => item.id === serviceId);
  const resourceId =
    service?.resources.length === 1 ? (service.resources[0]?.id ?? "") : "";
  return { serviceId, resourceId };
}

export function selectionAfterServiceChange(
  services: PublicService[],
  serviceId: string,
  previousResourceId: string,
) {
  const service = services.find((item) => item.id === serviceId);
  if (!service) return { serviceId, resourceId: "" };
  if (service.resources.length === 1) {
    return { serviceId, resourceId: service.resources[0]?.id ?? "" };
  }
  return {
    serviceId,
    resourceId: service.resources.some(
      (resource) => resource.id === previousResourceId,
    )
      ? previousResourceId
      : "",
  };
}

function validIsraeliPhone(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("00972")
    ? `+${trimmed.slice(2)}`
    : trimmed.startsWith("972")
      ? `+${trimmed}`
      : trimmed;
  const phone = parsePhoneNumberFromString(normalized, "IL");
  return phone?.country === "IL" && phone.isValid();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateGuestDetails(
  details: Pick<GuestDetails, GuestField>,
): GuestFieldErrors {
  const errors: GuestFieldErrors = {};
  if (!details.guestName.trim()) errors.guestName = "Enter your name.";
  if (!validIsraeliPhone(details.guestPhone)) {
    errors.guestPhone = "Enter a valid Israeli phone number.";
  }
  const email = details.guestEmail.trim();
  if (email && !validEmail(email)) {
    errors.guestEmail = "Enter a valid email address.";
  }
  return errors;
}

export function guestFieldForApiError(code: string): GuestField | null {
  if (code === "INVALID_GUEST_NAME") return "guestName";
  if (code === "INVALID_GUEST_PHONE") return "guestPhone";
  if (code === "INVALID_GUEST_EMAIL") return "guestEmail";
  return null;
}
