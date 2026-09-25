import { apiClient } from "@/shared/api/client";

type BookingLifecycleResponse = {
  id: string;
  status: "confirmed" | "cancelled" | "no_show";
};

type BookingActionInput = {
  bookingId: string;
  organizationId: string;
};

function bookingActionPath(input: BookingActionInput, action: string) {
  return `/api/organizations/${input.organizationId}/bookings/${input.bookingId}/${action}`;
}

export function cancelBooking(
  input: BookingActionInput & { reason?: string | null },
) {
  return apiClient<BookingLifecycleResponse>(
    bookingActionPath(input, "cancel"),
    {
      method: "POST",
      body: input.reason ? { reason: input.reason } : {},
    },
  );
}

export function markBookingNoShow(input: BookingActionInput) {
  return apiClient<BookingLifecycleResponse>(
    bookingActionPath(input, "mark-no-show"),
    { method: "POST" },
  );
}

export function revertBookingNoShow(input: BookingActionInput) {
  return apiClient<BookingLifecycleResponse>(
    bookingActionPath(input, "revert-no-show"),
    { method: "POST" },
  );
}
