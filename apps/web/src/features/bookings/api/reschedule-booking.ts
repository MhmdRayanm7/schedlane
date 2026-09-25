import { apiClient } from "@/shared/api/client";

export type BookingRescheduleOptions = {
  timezone: "Asia/Jerusalem";
  bookingId: string;
  serviceId: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  date: string;
  selectedResourceId: string | null;
  resources: Array<{ id: string; name: string }>;
  starts: number[];
};

type GetRescheduleOptionsInput = {
  bookingId: string;
  date: string;
  organizationId: string;
  resourceId?: string;
  signal?: AbortSignal;
};

export function getRescheduleOptions({
  bookingId,
  date,
  organizationId,
  resourceId,
  signal,
}: GetRescheduleOptionsInput) {
  const query = new URLSearchParams({ date });
  if (resourceId) query.set("resourceId", resourceId);
  return apiClient<BookingRescheduleOptions>(
    `/api/organizations/${organizationId}/bookings/${bookingId}/reschedule-options?${query}`,
    { signal },
  );
}

type RescheduleBookingInput = {
  bookingId: string;
  organizationId: string;
  resourceId: string;
  date: string;
  startMinute: number;
};

export function rescheduleBooking({
  bookingId,
  organizationId,
  ...body
}: RescheduleBookingInput) {
  return apiClient<{ id: string; startAt: string }>(
    `/api/organizations/${organizationId}/bookings/${bookingId}/reschedule`,
    { method: "POST", body },
  );
}
