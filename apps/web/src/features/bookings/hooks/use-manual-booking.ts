import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createManualBooking,
  getManualBookingContext,
  getManualBookingOptions,
} from "../api/manual-booking";
import type { CreateManualBookingInput } from "../types";

export function manualBookingContextKey(organizationId: string) {
  return [
    "organizations",
    organizationId,
    "bookings",
    "manual-context",
  ] as const;
}

export function useManualBookingContext(
  organizationId: string,
  enabled: boolean,
) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: manualBookingContextKey(organizationId),
    queryFn: ({ signal }) => getManualBookingContext(organizationId, signal),
  });
}

type OptionsInput = {
  organizationId: string;
  resourceId: string;
  serviceId: string;
  date: string;
  enabled: boolean;
};

export function manualBookingOptionsKey(input: Omit<OptionsInput, "enabled">) {
  return [
    "organizations",
    input.organizationId,
    "bookings",
    "manual-options",
    {
      resourceId: input.resourceId,
      serviceId: input.serviceId,
      date: input.date,
    },
  ] as const;
}

export function useManualBookingOptions(input: OptionsInput) {
  const { enabled, ...request } = input;
  return useQuery({
    enabled:
      enabled &&
      Boolean(
        request.organizationId &&
          request.resourceId &&
          request.serviceId &&
          request.date,
      ),
    queryKey: manualBookingOptionsKey(request),
    queryFn: ({ signal }) => getManualBookingOptions({ ...request, signal }),
  });
}

export function useCreateManualBooking(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateManualBookingInput) => createManualBooking(input),
    onSuccess: async (_booking, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["organizations", organizationId, "bookings"],
        }),
        queryClient.invalidateQueries({
          queryKey: manualBookingOptionsKey({
            organizationId,
            resourceId: input.resourceId,
            serviceId: input.serviceId,
            date: input.date,
          }),
        }),
      ]);
    },
  });
}
