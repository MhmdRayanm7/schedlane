import { MoreHorizontal } from "lucide-react";
import type { Resource } from "@/features/resources/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import styles from "../team.module.css";
import type { TeamInvitation } from "../types";

type InvitationsListProps = {
  invitations: TeamInvitation[];
  resources: Resource[];
  isReadOnly: boolean;
  onRevoke: (invitation: TeamInvitation) => void;
  onInviteAgain: (invitation: TeamInvitation) => void;
};

function formatExpiration(isoString: string): string {
  try {
    const date = new Date(isoString);
    return `Expires ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date)}`;
  } catch {
    return `Expires ${isoString}`;
  }
}

export function InvitationsList({
  invitations,
  resources,
  isReadOnly,
  onRevoke,
  onInviteAgain,
}: InvitationsListProps) {
  if (invitations.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No pending invitations.</p>
      </div>
    );
  }

  const resourceMap = new Map(resources.map((r) => [r.id, r.name]));

  return (
    <ul className={styles.list} aria-label="Organization invitations">
      {invitations.map((invitation) => {
        const isPending = invitation.status === "pending";
        const resourceName = invitation.resourceId
          ? resourceMap.get(invitation.resourceId)
          : null;

        const roleText =
          invitation.role === "staff" && resourceName
            ? `Staff · ${resourceName}`
            : invitation.role === "owner"
              ? "Owner"
              : invitation.role === "manager"
                ? "Manager"
                : "Staff";

        return (
          <li key={invitation.id} className={styles.row}>
            <div className={styles.rowMobileHeader}>
              <div className={styles.invitationMain}>
                <span
                  className={styles.invitationEmail}
                  title={invitation.email}
                >
                  {invitation.email}
                </span>
                <div className={styles.invitationMeta}>
                  <span>{roleText}</span>
                  <span className={styles.metaDot} aria-hidden="true">
                    ·
                  </span>
                  <span>{formatExpiration(invitation.expiresAt)}</span>
                  <span className={styles.metaDot} aria-hidden="true">
                    ·
                  </span>
                  <span>Invited by {invitation.invitedByName}</span>
                </div>
              </div>

              <div className={styles.rowActions}>
                <span
                  className={`${styles.statusBadge} ${
                    isPending ? styles.statusPending : styles.statusExpired
                  }`}
                >
                  {isPending ? "Pending" : "Expired"}
                </span>

                {!isReadOnly ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={styles.menuTrigger}
                      aria-label={`Actions for ${invitation.email}`}
                    >
                      <MoreHorizontal
                        aria-hidden="true"
                        className={styles.menuIcon}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!isPending ? (
                        <>
                          <DropdownMenuItem
                            onClick={() => onInviteAgain(invitation)}
                          >
                            Invite again
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      ) : null}

                      <DropdownMenuItem
                        className={styles.destructiveItem}
                        onClick={() => onRevoke(invitation)}
                      >
                        Revoke invitation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
