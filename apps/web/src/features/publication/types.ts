export type PublicationServiceBlocker = {
  serviceId: string;
  serviceName: string;
};

export type PublicationReadinessCode =
  | "organization_active"
  | "platform_active"
  | "active_service"
  | "active_resource"
  | "service_resources"
  | "working_hours"
  | "service_prices";

export type PublicationReadinessCheck = {
  code: PublicationReadinessCode;
  ready: boolean;
  count?: number;
  services?: PublicationServiceBlocker[];
  applicable?: boolean;
};

export type PublicationReadiness = {
  ready: boolean;
  checks: PublicationReadinessCheck[];
};

export type PublicationRequestStatus = "pending" | "approved" | "rejected";

export type OrganizationPublicationStatus = {
  publishedAt: string | null;
  publicBookingPaused: boolean;
  latestRequest: {
    id: string;
    status: PublicationRequestStatus;
    requestedAt: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
  } | null;
};
