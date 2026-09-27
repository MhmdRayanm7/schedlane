export type OrganizationRequestStatus = "pending" | "approved" | "rejected";

export type OrganizationRequest = {
  id: string;
  name: string;
  description: string | null;
  contactPhone: string | null;
  additionalContext: string | null;
  wantsSetupHelp: boolean;
  status: OrganizationRequestStatus;
  organizationId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type OrganizationRequestInput = {
  name: string;
  description: string;
  contactPhone?: string;
  additionalContext?: string;
  wantsSetupHelp: boolean;
};
