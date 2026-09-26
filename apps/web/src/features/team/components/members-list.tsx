import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import styles from "../team.module.css";
import type { MembershipRole, TeamMember } from "../types";

type MembersListProps = {
  members: TeamMember[];
  viewerRole: MembershipRole;
  isReadOnly: boolean;
  onChangeRole: (member: TeamMember) => void;
  onRemoveMember: (member: TeamMember) => void;
  onLeaveOrganization: () => void;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleBadgeClass(role: MembershipRole): string {
  switch (role) {
    case "owner":
      return `${styles.roleBadge} ${styles.roleOwner}`;
    case "manager":
      return `${styles.roleBadge} ${styles.roleManager}`;
    case "staff":
      return `${styles.roleBadge} ${styles.roleStaff}`;
  }
}

function roleLabel(role: MembershipRole): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "manager":
      return "Manager";
    case "staff":
      return "Staff";
  }
}

export function MembersList({
  members,
  viewerRole,
  isReadOnly,
  onChangeRole,
  onRemoveMember,
  onLeaveOrganization,
}: MembersListProps) {
  if (members.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No members found.</p>
      </div>
    );
  }

  return (
    <ul className={styles.list} aria-label="Organization members">
      {members.map((member, index) => {
        const canChangeRole =
          !isReadOnly &&
          viewerRole === "owner" &&
          (member.isSelf || Boolean(member.membershipId));

        const canRemoveMember =
          !isReadOnly &&
          !member.isSelf &&
          Boolean(member.membershipId) &&
          (viewerRole === "owner" ||
            (viewerRole === "manager" && member.role === "staff"));

        const canLeave = !isReadOnly && member.isSelf;

        const hasActions = canChangeRole || canRemoveMember || canLeave;

        return (
          <li
            key={member.membershipId ?? `self-${index}`}
            className={styles.row}
          >
            <div className={styles.rowMobileHeader}>
              <div className={styles.identity}>
                <span className={styles.avatar} aria-hidden="true">
                  {getInitials(member.name)}
                </span>
                <div className={styles.nameGroup}>
                  <span className={styles.memberName} title={member.name}>
                    {member.name}
                  </span>
                  {member.isSelf ? (
                    <span className={styles.selfBadge}>You</span>
                  ) : null}
                </div>
              </div>

              {hasActions ? (
                <div className={styles.rowActions}>
                  <span className={roleBadgeClass(member.role)}>
                    {roleLabel(member.role)}
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={styles.menuTrigger}
                      aria-label={`Actions for ${member.name}`}
                    >
                      <MoreHorizontal
                        aria-hidden="true"
                        className={styles.menuIcon}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canChangeRole ? (
                        <DropdownMenuItem onClick={() => onChangeRole(member)}>
                          Change role
                        </DropdownMenuItem>
                      ) : null}

                      {canRemoveMember ? (
                        <>
                          {canChangeRole ? <DropdownMenuSeparator /> : null}
                          <DropdownMenuItem
                            className={styles.destructiveItem}
                            onClick={() => onRemoveMember(member)}
                          >
                            Remove member
                          </DropdownMenuItem>
                        </>
                      ) : null}

                      {canLeave ? (
                        <>
                          {canChangeRole ? <DropdownMenuSeparator /> : null}
                          <DropdownMenuItem
                            className={styles.destructiveItem}
                            onClick={onLeaveOrganization}
                          >
                            Leave organization
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <div className={styles.rowActions}>
                  <span className={roleBadgeClass(member.role)}>
                    {roleLabel(member.role)}
                  </span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
