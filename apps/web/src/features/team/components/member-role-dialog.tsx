import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { useUpdateMemberRole } from "../hooks/use-team";
import styles from "../team.module.css";
import type { MembershipRole, TeamMember } from "../types";

type MemberRoleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  member: TeamMember | null;
  ownersCount: number;
  isReadOnly: boolean;
};

const ROLES: Array<{
  role: MembershipRole;
  title: string;
  description: string;
}> = [
  {
    role: "owner",
    title: "Owner",
    description: "Full organization control, including access management.",
  },
  {
    role: "manager",
    title: "Manager",
    description: "Manage day-to-day operations and Staff access.",
  },
  {
    role: "staff",
    title: "Staff",
    description: "Limited operational access.",
  },
];

export function MemberRoleDialog({
  open,
  onOpenChange,
  organizationId,
  member,
  ownersCount,
  isReadOnly,
}: MemberRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<MembershipRole>("staff");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateRoleMutation = useUpdateMemberRole(organizationId);

  useEffect(() => {
    if (open && member) {
      setSelectedRole(member.role);
      setErrorMessage(null);
    }
  }, [open, member]);

  if (!member) return null;

  const isSelf = member.isSelf;
  const isDemotingSelf =
    isSelf && member.role === "owner" && selectedRole !== "owner";
  const isLastOwnerDemotion = isDemotingSelf && ownersCount <= 1;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isReadOnly || updateRoleMutation.isPending || !member?.membershipId)
      return;

    if (isLastOwnerDemotion) {
      setErrorMessage("Add another Owner before changing your role.");
      return;
    }

    if (selectedRole === member.role) {
      onOpenChange(false);
      return;
    }

    setErrorMessage(null);

    try {
      await updateRoleMutation.mutateAsync({
        membershipId: member.membershipId,
        role: selectedRole,
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "ORGANIZATION_LAST_OWNER_REQUIRED":
            setErrorMessage("The organization must keep at least one Owner.");
            return;
          case "ORGANIZATION_OWNER_REQUIRED":
            setErrorMessage("Only an Owner can change member roles.");
            return;
          case "ORGANIZATION_MEMBER_NOT_FOUND":
            setErrorMessage("This member could not be found.");
            return;
          case "ORGANIZATION_ARCHIVED":
            setErrorMessage(
              "This organization is archived and cannot be modified.",
            );
            return;
          case "ORGANIZATION_SUSPENDED":
            setErrorMessage(
              "This organization is suspended and cannot be modified.",
            );
            return;
          default:
            setErrorMessage(error.message || "Failed to update member role.");
            return;
        }
      }
      setErrorMessage("An unexpected error occurred. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!updateRoleMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        aria-busy={updateRoleMutation.isPending}
        className={styles.dialogContent}
      >
        <header className={styles.dialogHeader}>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Update access level for {member.name}.
          </DialogDescription>
        </header>

        <form onSubmit={handleSubmit} className={styles.dialogForm}>
          {errorMessage ? (
            <InlineAlert variant="error">{errorMessage}</InlineAlert>
          ) : null}

          {isLastOwnerDemotion ? (
            <InlineAlert variant="warning">
              Add another Owner before changing your role.
            </InlineAlert>
          ) : isDemotingSelf ? (
            <InlineAlert variant="warning">
              You will lose Owner-level permissions after saving.
            </InlineAlert>
          ) : !isSelf && selectedRole === "owner" && member.role !== "owner" ? (
            <InlineAlert variant="warning">
              The Owner role grants full organization control, including billing
              and member access.
            </InlineAlert>
          ) : null}

          <div
            className={styles.radioGroup}
            role="radiogroup"
            aria-label="Membership role"
          >
            {ROLES.map(({ role, title, description }) => {
              const isSelected = selectedRole === role;
              return (
                <label
                  key={role}
                  className={`${styles.radioOption} ${
                    isSelected ? styles.radioOptionSelected : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="membership-role"
                    value={role}
                    checked={isSelected}
                    disabled={isReadOnly || updateRoleMutation.isPending}
                    onChange={() => setSelectedRole(role)}
                    className={styles.radioInput}
                  />
                  <div className={styles.radioLabel}>
                    <span className={styles.radioTitle}>{title}</span>
                    <span className={styles.radioDescription}>
                      {description}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          <div className={styles.dialogActions}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateRoleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={updateRoleMutation.isPending}
              disabled={
                isReadOnly ||
                updateRoleMutation.isPending ||
                isLastOwnerDemotion ||
                selectedRole === member.role
              }
            >
              Save role
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
