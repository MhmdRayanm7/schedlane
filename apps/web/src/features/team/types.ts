export type MembershipRole = "owner" | "manager" | "staff";

export type TeamMember = {
  name: string;
  role: MembershipRole;
  isSelf: boolean;
  membershipId?: string;
};

export type TeamMembersResponse = {
  items: TeamMember[];
};

export type InvitationStatus = "pending" | "expired";

export type TeamInvitation = {
  id: string;
  email: string;
  role: MembershipRole;
  resourceId: string | null;
  status: InvitationStatus;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
};

export type TeamInvitationsResponse = {
  items: TeamInvitation[];
};

export type CreateInvitationInput = {
  email: string;
  role: MembershipRole;
  resourceId?: string;
};

export type UpdateMemberRoleInput = {
  membershipId: string;
  role: MembershipRole;
};

export type InvitationPreview = {
  organizationId: string;
  organizationName: string;
  role: MembershipRole;
  resource: {
    id: string;
    name: string;
  } | null;
  invitedByName: string;
  expiresAt: string;
};

export type AcceptInvitationResult = {
  organizationId: string;
  role: MembershipRole;
  resourceId: string | null;
  acceptedAt: string;
};
