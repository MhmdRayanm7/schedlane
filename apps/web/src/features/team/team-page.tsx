import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useOutletContext } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import { useResources } from "@/features/resources/hooks/use-resources";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { InvitationRevokeDialog } from "./components/invitation-revoke-dialog";
import { InvitationsList } from "./components/invitations-list";
import { InviteMemberDialog } from "./components/invite-member-dialog";
import { LeaveOrganizationDialog } from "./components/leave-organization-dialog";
import { MemberRemoveDialog } from "./components/member-remove-dialog";
import { MemberRoleDialog } from "./components/member-role-dialog";
import { MembersList } from "./components/members-list";
import { useTeamInvitations, useTeamMembers } from "./hooks/use-team";
import styles from "./team.module.css";
import type { MembershipRole, TeamInvitation, TeamMember } from "./types";

function MembersSkeleton() {
  return (
    <ul
      className={styles.skeletonList}
      aria-busy="true"
      aria-label="Loading members"
      role="status"
    >
      {[1, 2, 3].map((i) => (
        <li key={i} className={styles.skeletonRow}>
          <div className={styles.identity}>
            <div
              className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`}
            />
            <div className={`${styles.skeletonBlock} ${styles.skeletonText}`} />
          </div>
          <div className={`${styles.skeletonBlock} ${styles.skeletonBadge}`} />
        </li>
      ))}
    </ul>
  );
}

function InvitationsSkeleton() {
  return (
    <ul
      className={styles.skeletonList}
      aria-busy="true"
      aria-label="Loading invitations"
      role="status"
    >
      {[1, 2].map((i) => (
        <li key={i} className={styles.skeletonRow}>
          <div className={styles.identity}>
            <div
              className={`${styles.skeletonBlock} ${styles.skeletonText}`}
              style={{ width: "12rem" }}
            />
          </div>
          <div className={`${styles.skeletonBlock} ${styles.skeletonBadge}`} />
        </li>
      ))}
    </ul>
  );
}

export function TeamPage() {
  const { currentOrganization } = useOutletContext<OrganizationAccessContext>();
  const organizationId = currentOrganization.id;
  const viewerRole = currentOrganization.role;

  const isReadOnly = Boolean(
    currentOrganization.archivedAt || currentOrganization.suspendedAt,
  );

  const canManageInvitations =
    viewerRole === "owner" || viewerRole === "manager";

  const membersQuery = useTeamMembers(organizationId);
  const invitationsQuery = useTeamInvitations(organizationId, {
    enabled: canManageInvitations,
  });
  const resourcesQuery = useResources(organizationId);

  // Dialog states
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteInitialValues, setInviteInitialValues] = useState<{
    email?: string;
    role?: MembershipRole;
    resourceId?: string | null;
  } | null>(null);

  const [roleDialogMember, setRoleDialogMember] = useState<TeamMember | null>(
    null,
  );
  const [removeDialogMember, setRemoveDialogMember] =
    useState<TeamMember | null>(null);
  const [revokeDialogInvitation, setRevokeDialogInvitation] =
    useState<TeamInvitation | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  const members = membersQuery.data?.items ?? [];
  const invitations = invitationsQuery.data?.items ?? [];
  const resources = resourcesQuery.data?.items ?? [];

  const ownersCount = members.filter((m) => m.role === "owner").length;
  const pendingInvitationsCount = invitations.filter(
    (i) => i.status === "pending",
  ).length;

  function handleOpenInvite() {
    setInviteInitialValues(null);
    setInviteDialogOpen(true);
  }

  function handleInviteAgain(invitation: TeamInvitation) {
    setInviteInitialValues({
      email: invitation.email,
      role: invitation.role,
      resourceId: invitation.resourceId,
    });
    setInviteDialogOpen(true);
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Team"
        description="Manage organization members and their access."
        action={
          canManageInvitations && !isReadOnly ? (
            <Button onClick={handleOpenInvite} size="sm">
              <Plus aria-hidden="true" className={styles.menuIcon} />
              Invite member
            </Button>
          ) : undefined
        }
      />

      {/* Members Section */}
      <section className={styles.section} aria-labelledby="members-heading">
        <header className={styles.sectionHeader}>
          <h2 id="members-heading" className={styles.sectionHeading}>
            Members
            {!membersQuery.isPending && !membersQuery.isError ? (
              <span className={styles.countBadge}>{members.length}</span>
            ) : null}
          </h2>
        </header>

        {membersQuery.isPending ? (
          <MembersSkeleton />
        ) : membersQuery.isError ? (
          <div className={styles.sectionError}>
            <InlineAlert variant="error">
              Failed to load organization members.
            </InlineAlert>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void membersQuery.refetch()}
            >
              <RefreshCw aria-hidden="true" className={styles.menuIcon} />
              Try again
            </Button>
          </div>
        ) : (
          <MembersList
            members={members}
            viewerRole={viewerRole}
            isReadOnly={isReadOnly}
            onChangeRole={(m) => setRoleDialogMember(m)}
            onRemoveMember={(m) => setRemoveDialogMember(m)}
            onLeaveOrganization={() => setLeaveDialogOpen(true)}
          />
        )}
      </section>

      {/* Invitations Section (Owner and Manager only) */}
      {canManageInvitations ? (
        <section
          className={styles.section}
          aria-labelledby="invitations-heading"
        >
          <header className={styles.sectionHeader}>
            <h2 id="invitations-heading" className={styles.sectionHeading}>
              Invitations
              {!invitationsQuery.isPending && !invitationsQuery.isError ? (
                <span className={styles.countBadge}>
                  {pendingInvitationsCount}
                </span>
              ) : null}
            </h2>
          </header>

          {invitationsQuery.isPending ? (
            <InvitationsSkeleton />
          ) : invitationsQuery.isError ? (
            <div className={styles.sectionError}>
              <InlineAlert variant="error">
                Failed to load invitations.
              </InlineAlert>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void invitationsQuery.refetch()}
              >
                <RefreshCw aria-hidden="true" className={styles.menuIcon} />
                Try again
              </Button>
            </div>
          ) : (
            <InvitationsList
              invitations={invitations}
              resources={resources}
              isReadOnly={isReadOnly}
              onRevoke={(inv) => setRevokeDialogInvitation(inv)}
              onInviteAgain={handleInviteAgain}
            />
          )}
        </section>
      ) : null}

      {/* Dialogs */}
      {canManageInvitations ? (
        <InviteMemberDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          organizationId={organizationId}
          viewerRole={viewerRole}
          initialValues={inviteInitialValues}
          isReadOnly={isReadOnly}
        />
      ) : null}

      <MemberRoleDialog
        open={Boolean(roleDialogMember)}
        onOpenChange={(open) => !open && setRoleDialogMember(null)}
        organizationId={organizationId}
        member={roleDialogMember}
        ownersCount={ownersCount}
        isReadOnly={isReadOnly}
      />

      <MemberRemoveDialog
        open={Boolean(removeDialogMember)}
        onOpenChange={(open) => !open && setRemoveDialogMember(null)}
        organizationId={organizationId}
        member={removeDialogMember}
        isReadOnly={isReadOnly}
      />

      {canManageInvitations ? (
        <InvitationRevokeDialog
          open={Boolean(revokeDialogInvitation)}
          onOpenChange={(open) => !open && setRevokeDialogInvitation(null)}
          organizationId={organizationId}
          invitation={revokeDialogInvitation}
          isReadOnly={isReadOnly}
        />
      ) : null}

      <LeaveOrganizationDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        organizationId={organizationId}
        organizationName={currentOrganization.name}
        viewerRole={viewerRole}
        ownersCount={ownersCount}
        isReadOnly={isReadOnly}
      />
    </div>
  );
}
