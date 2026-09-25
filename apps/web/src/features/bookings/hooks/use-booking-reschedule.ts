import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/api-error";
import {
  getRescheduleOptions,
  rescheduleBooking,
} from "../api/reschedule-booking";

type UseRescheduleOptionsInput = {
  bookingId: string;
  date: string;
  enabled: boolean;
  organizationId: string;
  resourceId: string | null;
};

export function useRescheduleOptions(input: UseRescheduleOptionsInput) {
  const queryClient = useQueryClient();
  const bookingsKey = [
    "organizations",
    input.organizationId,
    "bookings",
  ] as const;
  return useQuery({
    enabled: input.enabled,
    queryKey: [
      "organizations",
      input.organizationId,
      "bookings",
      input.bookingId,
      "reschedule-options",
      { date: input.date, resourceId: input.resourceId },
    ],
    queryFn: async ({ signal }) => {
      try {
        return await getRescheduleOptions({
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          date: input.date,
          ...(input.resourceId ? { resourceId: input.resourceId } : {}),
          signal,
        });
      } catch (error) {
        if (
          error instanceof ApiError &&
          [
            "INVALID_BOOKING_STATUS",
            "RESOURCE_INACTIVE",
            "SERVICE_NOT_ASSIGNED",
            "ORGANIZATION_ARCHIVED",
            "ORGANIZATION_SUSPENDED",
          ].includes(error.code)
        )
          void queryClient.invalidateQueries({ queryKey: bookingsKey });
        throw error;
      }
    },
  });
}

export function useRescheduleBooking(organizationId: string) {
  const queryClient = useQueryClient();
  const bookingsKey = ["organizations", organizationId, "bookings"] as const;
  return useMutation({
    mutationFn: rescheduleBooking,
    onError: (error) => {
      if (
        error instanceof ApiError &&
        [
          "INVALID_BOOKING_STATUS",
          "RESOURCE_INACTIVE",
          "SERVICE_NOT_ASSIGNED",
          "ORGANIZATION_ARCHIVED",
          "ORGANIZATION_SUSPENDED",
        ].includes(error.code)
      )
        void queryClient.invalidateQueries({ queryKey: bookingsKey });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingsKey }),
  });
}
