import { useQuery } from "@tanstack/react-query";
import { getBookings } from "../api/get-bookings";

type UseBookingsInput = {
  fromDate: string;
  organizationId: string;
  toDate: string;
};

export function bookingsQueryKey({
  fromDate,
  organizationId,
  toDate,
}: UseBookingsInput) {
  return [
    "organizations",
    organizationId,
    "bookings",
    { fromDate, toDate },
  ] as const;
}

export function useBookings(input: UseBookingsInput) {
  return useQuery({
    queryFn: ({ signal }) => getBookings({ ...input, signal }),
    queryKey: bookingsQueryKey(input),
  });
}
