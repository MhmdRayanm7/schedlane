import { apiClient } from "@/shared/api/client";
import type {
  BookingContext,
  CreatedBooking,
  GuestDetails,
  ManagedBooking,
  PublicAvailability,
} from "../types";

const base = (slug: string) =>
  `/api/public/organizations/${encodeURIComponent(slug)}`;

export const publicBookingKeys = {
  context: (slug: string) => ["public-booking", slug, "context"] as const,
  availability: (
    slug: string,
    serviceId: string,
    resourceId: string,
    date: string,
  ) =>
    [
      "public-booking",
      slug,
      "availability",
      serviceId,
      resourceId,
      date,
    ] as const,
};

export const guestBookingKey = ["guest-booking", "current"] as const;

export function getBookingContext(slug: string, signal?: AbortSignal) {
  return apiClient<BookingContext>(`${base(slug)}/booking-context`, { signal });
}

export function getPublicAvailability(
  slug: string,
  serviceId: string,
  resourceId: string,
  date: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ serviceId, resourceId, date });
  return apiClient<PublicAvailability>(`${base(slug)}/availability?${query}`, {
    signal,
  });
}

export function getNextAvailability(
  slug: string,
  serviceId: string,
  resourceId: string,
  fromDate: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ serviceId, resourceId, fromDate });
  return apiClient<{ availability: PublicAvailability | null }>(
    `${base(slug)}/availability/next?${query}`,
    { signal },
  );
}

export function createGuestBooking(
  slug: string,
  input: {
    serviceId: string;
    resourceId: string;
    date: string;
    startMinute: number;
  } & GuestDetails,
) {
  return apiClient<CreatedBooking>(`${base(slug)}/bookings`, {
    method: "POST",
    body: {
      ...input,
      guestEmail: input.guestEmail.trim() || null,
      customerNote: input.customerNote.trim() || null,
    },
  });
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function getManagedBooking(token: string, signal?: AbortSignal) {
  return apiClient<ManagedBooking>("/api/public/bookings/manage", {
    headers: bearer(token),
    signal,
  });
}

export function updateManagedContact(
  token: string,
  input: Pick<GuestDetails, "guestName" | "guestPhone" | "guestEmail">,
) {
  return apiClient<
    Pick<
      ManagedBooking,
      "publicReference" | "guestName" | "guestPhone" | "guestEmail"
    >
  >("/api/public/bookings/manage/contact", {
    method: "PATCH",
    headers: bearer(token),
    body: { ...input, guestEmail: input.guestEmail.trim() || null },
  });
}

export function cancelManagedBooking(token: string, reason: string) {
  return apiClient("/api/public/bookings/manage/cancel", {
    method: "POST",
    headers: bearer(token),
    body: { reason: reason.trim() || null },
  });
}
