import { apiClient } from "@/shared/api/client";
import { SCHEDULING_TIMEZONE } from "@/shared/lib/date-time";
import type { BookingStatusFilter, ManagementBookingsResponse } from "../types";

type GetBookingsInput = {
  fromDate: string;
  organizationId: string;
  signal?: AbortSignal;
  toDate: string;
  status: BookingStatusFilter;
};

export async function getBookings({
  fromDate,
  organizationId,
  signal,
  toDate,
  status,
}: GetBookingsInput) {
  const search = new URLSearchParams({ fromDate, toDate });
  if (status !== "all") search.set("status", status);
  const response = await apiClient<ManagementBookingsResponse>(
    `/api/organizations/${encodeURIComponent(organizationId)}/bookings?${search}`,
    { signal },
  );

  if (response.timezone !== SCHEDULING_TIMEZONE) {
    throw new Error("Unexpected scheduling timezone");
  }

  return response;
}
