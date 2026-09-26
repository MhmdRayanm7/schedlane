import { useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { useRemoveMember } from "../hooks/use-team";
import styles from "../team.module.css";
import type { TeamMember } from "../types";

type MemberRemoveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  member: TeamMember | null;
  isReadOnly: boolean;
};

export function MemberRemoveDialog({
  open,
  onOpenChange,
  organizationId,
  member,
  isReadOnly,
}: MemberRemoveDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const removeMutation = useRemoveMember(organizationId);

  if (!member) return null;

  async function handleRemove() {
    if (isReadOnly || removeMutation.isPending || !member?.membershipId) return;

    setErrorMessage(null);

    try {
      await removeMutation.mutateAsync(member.membershipId);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "ORGANIZATION_MEMBER_NOT_FOUND":
            setErrorMessage("This member could not be found.");
            return;
          case "ORGANIZATION_MEMBER_REMOVAL_NOT_ALLOWED":
            setErrorMessage("Your role does not allow removing this member.");
            return;
          case "ORGANIZATION_SELF_REMOVAL_REQUIRES_LEAVE":
            setErrorMessage(
              "You cannot remove yourself using this action. Use leave organization instead.",
            );
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
            setErrorMessage(error.message || "Failed to remove member.");
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
        if (!removeMutation.isPending) {
          setErrorMessage(null);
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent
        aria-busy={removeMutation.isPending}
        className={styles.dialogContent}
      >
        <header className={styles.dialogHeader}>
          <DialogTitle>Remove member?</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{member.name}</strong> from
            the organization?
          </DialogDescription>
        </header>

        <div className={styles.dialogForm}>
          {errorMessage ? (
            <InlineAlert variant="error">{errorMessage}</InlineAlert>
          ) : null}

          <p className={styles.radioDescription}>
            Removing a member revokes their organization access immediately. If
            their account is linked to a Resource, that account link is removed,
            but the Resource and its booking history remain intact.
          </p>

          <div className={styles.dialogActions}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={removeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={removeMutation.isPending}
              disabled={isReadOnly || removeMutation.isPending}
              onClick={handleRemove}
            >
              Remove member
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
