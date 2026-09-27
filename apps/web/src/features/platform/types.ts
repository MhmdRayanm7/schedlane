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
  createdAt: string;
};

export type CursorPage<T> = { items: T[]; nextCursor: string | null };
