import { apiClient } from "@/shared/api/client";
import type {
  AcceptInvitationResult,
  CreateInvitationInput,
  InvitationPreview,
  TeamInvitation,
  TeamInvitationsResponse,
  TeamMembersResponse,
  UpdateMemberRoleInput,
} from "../types";

export function getTeamMembers(
  organizationId: string,
  signal?: AbortSignal,
): Promise<TeamMembersResponse> {
  return apiClient<TeamMembersResponse>(
    `/api/organizations/${organizationId}/members`,
    { signal },
  );
}

export function getTeamInvitations(
  organizationId: string,
  signal?: AbortSignal,
): Promise<TeamInvitationsResponse> {
  return apiClient<TeamInvitationsResponse>(
    `/api/organizations/${organizationId}/invitations`,
    { signal },
  );
}

export function createInvitation(
  organizationId: string,
  input: CreateInvitationInput,
): Promise<{ invitation: TeamInvitation }> {
  return apiClient<{ invitation: TeamInvitation }>(
    `/api/organizations/${organizationId}/invitations`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function revokeInvitation(
  organizationId: string,
  invitationId: string,
): Promise<TeamInvitation> {
  return apiClient<TeamInvitation>(
    `/api/organizations/${organizationId}/invitations/${invitationId}/revoke`,
    {
      method: "POST",
    },
  );
}

export function updateMemberRole(
  organizationId: string,
  input: UpdateMemberRoleInput,
): Promise<{ id: string; role: string }> {
  return apiClient<{ id: string; role: string }>(
    `/api/organizations/${organizationId}/members/${input.membershipId}/role`,
    {
      method: "PATCH",
      body: { role: input.role },
    },
  );
}

export function removeMember(
  organizationId: string,
  membershipId: string,
): Promise<void> {
  return apiClient<void>(
    `/api/organizations/${organizationId}/members/${membershipId}`,
    {
      method: "DELETE",
    },
  );
}

export function leaveOrganization(organizationId: string): Promise<void> {
  return apiClient<void>(`/api/organizations/${organizationId}/leave`, {
    method: "POST",
  });
}

export function previewInvitation(
  token: string,
  signal?: AbortSignal,
): Promise<InvitationPreview> {
  return apiClient<InvitationPreview>("/api/organization-invitations/preview", {
    method: "POST",
    body: { token },
    signal,
  });
}

export function acceptInvitation(
  token: string,
): Promise<AcceptInvitationResult> {
  return apiClient<AcceptInvitationResult>(
    "/api/organization-invitations/accept",
    {
      method: "POST",
      body: { token },
    },
  );
}
