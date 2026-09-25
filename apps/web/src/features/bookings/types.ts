export type BookingStatus = "confirmed" | "cancelled" | "no_show";

export type ManagementBooking = {
  id: string;
  publicReference: string;
  status: BookingStatus;
  resourceId: string;
  resourceName: string;
  serviceId: string;
  serviceName: string;
  startAt: string;
  serviceEndAt: string;
  occupiedUntilAt: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  priceAgorot: number | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  customerNote: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagementBookingsResponse = {
  timezone: "Asia/Jerusalem";
  fromDate: string;
  toDate: string;
  bookings: ManagementBooking[];
};
