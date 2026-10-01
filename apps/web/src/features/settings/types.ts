export type StaffTeamVisibility = "team" | "self";

export type OrganizationSettings = {
  staffTeamVisibility: StaffTeamVisibility;
  pricingEnabled: boolean;
};

export type BookingShareLink = {
  id: string;
  token: string;
  serviceId: string | null;
  resourceId: string | null;
  serviceName: string | null;
  resourceName: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export type CreateBookingShareLinkInput = {
  serviceId?: string;
  resourceId?: string;
};
