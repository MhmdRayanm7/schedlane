import { apiClient } from "@/shared/api/client";
import type {
  CreateManualBookingInput,
  ManualBookingContext,
  ManualBookingOptions,
} from "../types";

export function getManualBookingContext(
  organizationId: string,
  signal?: AbortSignal,
) {
  return apiClient<ManualBookingContext>(
    `/api/organizations/${encodeURIComponent(organizationId)}/bookings/manual-context`,
    { signal },
  );
}

export function getManualBookingOptions(input: {
  organizationId: string;
  resourceId: string;
  serviceId: string;
  date: string;
  signal?: AbortSignal;
}) {
  const search = new URLSearchParams({
    resourceId: input.resourceId,
    serviceId: input.serviceId,
    date: input.date,
  });
  return apiClient<ManualBookingOptions>(
    `/api/organizations/${encodeURIComponent(input.organizationId)}/bookings/manual-options?${search}`,
    { signal: input.signal },
  );
}

export function createManualBooking(input: CreateManualBookingInput) {
  return apiClient<{
    id: string;
    source: "manual";
    guestEmail: string | null;
  }>(
    `/api/organizations/${encodeURIComponent(input.organizationId)}/bookings/manual`,
    {
      method: "POST",
      body: {
        resourceId: input.resourceId,
        serviceId: input.serviceId,
        date: input.date,
        startMinute: input.startMinute,
        guestName: input.guestName.trim() || null,
        guestPhone: input.guestPhone.trim() || null,
        guestEmail: input.guestEmail.trim() || null,
        customerNote: input.customerNote.trim() || null,
      },
    },
  );
}
