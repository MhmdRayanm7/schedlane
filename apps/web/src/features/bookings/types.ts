export type BookingStatus = "confirmed" | "cancelled" | "no_show";
export type BookingSource = "public" | "manual";

export type ManagementBooking = {
  id: string;
  publicReference: string;
  status: BookingStatus;
  source: BookingSource;
  creator: { id: string; name: string; email: string } | null;
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
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  customerNote: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManualBookingContext = {
  role: "owner" | "manager" | "staff";
  resources: Array<{
    id: string;
    name: string;
    services: Array<{
      id: string;
      name: string;
      durationMinutes: number;
      bufferAfterMinutes: number;
      priceAgorot: number | null;
    }>;
  }>;
};

export type ManualBookingOptions = {
  timezone: "Asia/Jerusalem";
  resourceId: string;
  serviceId: string;
  date: string;
  starts: number[];
};

export type CreateManualBookingInput = {
  organizationId: string;
  resourceId: string;
  serviceId: string;
  date: string;
  startMinute: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  customerNote: string;
};

export type ManagementBookingsResponse = {
  timezone: "Asia/Jerusalem";
  fromDate: string;
  toDate: string;
  bookings: ManagementBooking[];
};
