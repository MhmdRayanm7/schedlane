import { useQuery } from "@tanstack/react-query";
import { getBookings } from "../api/get-bookings";
import type { BookingStatusFilter } from "../types";

type UseBookingsInput = {
  fromDate: string;
  organizationId: string;
  toDate: string;
  status: BookingStatusFilter;
};

export function bookingsQueryKey({
  fromDate,
  organizationId,
  toDate,
  status,
}: UseBookingsInput) {
  return [
    "organizations",
    organizationId,
    "bookings",
    { fromDate, toDate, status },
  ] as const;
}

export function useBookings(input: UseBookingsInput) {
  return useQuery({
    queryFn: ({ signal }) => getBookings({ ...input, signal }),
    queryKey: bookingsQueryKey(input),
  });
}
