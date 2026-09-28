export type PlatformIdentity = { id: string; name: string; email: string };
export type RequestStatus = "pending" | "approved" | "rejected";

export type PlatformRequest = {
  id: string;
  name: string;
  description: string | null;
  contactPhone: string | null;
  additionalContext: string | null;
  wantsSetupHelp: boolean;
  status: RequestStatus;
  requestedBy: { id: string; name: string; email: string };
  organizationId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type PlatformRequestDetail = PlatformRequest & {
  reviewedBy: { id: string; name: string; email: string } | null;
};

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  owner: { name: string; email: string } | null;
  publishedAt: string | null;
  publicBookingPaused: boolean;
  suspendedAt: string | null;
  archivedAt: string | null;
  pendingPublicationRequestId: string | null;
  createdAt: string;
};

export type CreatePlatformOrganizationInput = {
  organizationName: string;
  ownerEmail: string;
  customerMessage?: string;
  internalNote?: string;
};

export type PlatformPublicationRequest = {
  id: string;
  organizationId: string;
  organizationName: string;
  slug: string;
  requester: { name: string; email: string };
  status: PublicationRequestStatus;
  requestedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  publishedAt: string | null;
  readiness: PublicationReadiness | null;
};

export type PlatformPublicationRequestDetail = PlatformPublicationRequest & {
  publicBookingPaused: boolean;
  suspendedAt: string | null;
  archivedAt: string | null;
  pricingEnabled: boolean;
};

export type CursorPage<T> = { items: T[]; nextCursor: string | null };

import type {
  PublicationReadiness,
  PublicationRequestStatus,
} from "@/features/publication/types";
