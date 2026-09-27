export const organizationRequestEventTypes = {
  submitted: "organization_request.submitted",
  approved: "organization_request.approved",
  rejected: "organization_request.rejected",
} as const;

export type OrganizationRequestSubmittedPayload = {
  requestId: string;
  applicantName: string;
  applicantEmail: string;
  organizationName: string;
  description: string;
  contactPhone: string | null;
  additionalContext: string | null;
  wantsSetupHelp: boolean;
};

export type OrganizationRequestApprovedPayload = {
  requestId: string;
  applicantName: string;
  applicantEmail: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

export type OrganizationRequestRejectedPayload = {
  requestId: string;
  applicantName: string;
  applicantEmail: string;
  organizationName: string;
  rejectionReason: string;
};
