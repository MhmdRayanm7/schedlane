import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/api-error";
import {
  cancelBooking,
  markBookingNoShow,
  revertBookingNoShow,
} from "../api/booking-actions";

const refreshCodes = new Set([
  "INVALID_BOOKING_STATUS",
  "NO_SHOW_TOO_EARLY",
  "BOOKING_CONFLICT",
]);

export function useBookingActions(organizationId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["organizations", organizationId, "bookings"] as const;
  const refreshBookings = () => queryClient.invalidateQueries({ queryKey });
  const refreshOnStaleError = (error: Error) => {
    if (error instanceof ApiError && refreshCodes.has(error.code))
      void refreshBookings();
  };

  return {
    cancel: useMutation({
      mutationFn: cancelBooking,
      onError: refreshOnStaleError,
      onSuccess: refreshBookings,
    }),
    markNoShow: useMutation({
      mutationFn: markBookingNoShow,
      onError: refreshOnStaleError,
      onSuccess: refreshBookings,
    }),
    revertNoShow: useMutation({
      mutationFn: revertBookingNoShow,
      onError: refreshOnStaleError,
      onSuccess: refreshBookings,
    }),
  };
}
