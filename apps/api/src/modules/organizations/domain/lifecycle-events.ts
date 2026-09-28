export const organizationLifecycleEventTypes = {
  manuallyProvisioned: "organization.manually_provisioned",
  suspended: "organization.suspended",
  unsuspended: "organization.unsuspended",
} as const;

type LifecycleRecipient = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  recipientName: string;
  recipientEmail: string;
};

export type OrganizationManuallyProvisionedPayload = LifecycleRecipient & {
  customerMessage: string | null;
};

export type OrganizationSuspendedPayload = LifecycleRecipient & {
  reason: string;
};

export type OrganizationUnsuspendedPayload = LifecycleRecipient;
