export const organizationPublicationEventTypes = {
  requested: "organization.publication_requested",
  published: "organization.published",
  rejected: "organization.publication_rejected",
  unpublished: "organization.unpublished",
} as const;

type PublicationRecipient = {
  recipientName: string;
  recipientEmail: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

export type OrganizationPublicationRequestedPayload = PublicationRecipient & {
  requestId: string;
};

export type OrganizationPublishedPayload = PublicationRecipient & {
  requestId: string;
};

export type OrganizationPublicationRejectedPayload = PublicationRecipient & {
  requestId: string;
  rejectionReason: string;
};

export type OrganizationUnpublishedPayload = PublicationRecipient & {
  unpublicationId: string;
  reason: string;
};
