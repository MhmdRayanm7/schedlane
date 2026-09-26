export type PublicService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceAgorot: number | null;
  resources: Array<{ id: string; name: string }>;
};

export type BookingContext = {
  organization: { name: string; slug: string; timezone: "Asia/Jerusalem" };
  bookingWindow: { firstDate: string; lastDate: string };
  services: PublicService[];
};

export type PublicAvailability = {
  timezone: "Asia/Jerusalem";
  resourceId: string;
  serviceId: string;
  date: string;
  starts: number[];
};

export type GuestDetails = {
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  customerNote: string;
};

export type CreatedBooking = {
  publicReference: string;
  status: "confirmed";
  resourceId: string;
  serviceId: string;
  startAt: string;
  priceAgorot: number | null;
  managementToken: string;
};

export type ManagedBooking = {
  publicReference: string;
  status: "confirmed" | "cancelled" | "no_show";
  organizationName: string;
  resourceName: string;
  serviceName: string;
  startAt: string;
  serviceEndAt: string;
  durationMinutes: number;
  priceAgorot: number | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  customerNote: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancellationDeadlineAt: string;
  canCancel: boolean;
  canEditContact: boolean;
};
