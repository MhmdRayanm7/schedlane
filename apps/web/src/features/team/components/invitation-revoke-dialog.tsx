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
import { useRevokeInvitation } from "../hooks/use-team";
import styles from "../team.module.css";
import type { TeamInvitation } from "../types";

type InvitationRevokeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  invitation: TeamInvitation | null;
  isReadOnly: boolean;
};

export function InvitationRevokeDialog({
  open,
  onOpenChange,
  organizationId,
  invitation,
  isReadOnly,
}: InvitationRevokeDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const revokeMutation = useRevokeInvitation(organizationId);

  if (!invitation) return null;

  async function handleRevoke() {
    if (isReadOnly || revokeMutation.isPending || !invitation) return;

    setErrorMessage(null);

    try {
      await revokeMutation.mutateAsync(invitation.id);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "ORGANIZATION_INVITATION_NOT_FOUND":
            setErrorMessage("This invitation could not be found.");
            return;
          case "ORGANIZATION_INVITATION_ALREADY_ACCEPTED":
            setErrorMessage("This invitation has already been accepted.");
            return;
          case "ORGANIZATION_INVITATION_ALREADY_REVOKED":
            setErrorMessage("This invitation has already been revoked.");
            return;
          case "ORGANIZATION_INVITATION_NOT_ALLOWED":
            setErrorMessage(
              "Your role does not allow revoking this invitation.",
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
            setErrorMessage(
              error.message || "Failed to revoke the invitation.",
            );
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
        if (!revokeMutation.isPending) {
          setErrorMessage(null);
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent
        aria-busy={revokeMutation.isPending}
        className={styles.dialogContent}
      >
        <header className={styles.dialogHeader}>
          <DialogTitle>Revoke invitation?</DialogTitle>
          <DialogDescription>
            The invitation sent to <strong>{invitation.email}</strong> will be
            invalidated immediately.
          </DialogDescription>
        </header>

        <div className={styles.dialogForm}>
          {errorMessage ? (
            <InlineAlert variant="error">{errorMessage}</InlineAlert>
          ) : null}

          <p className={styles.radioDescription}>
            The recipient will no longer be able to use the link to join this
            organization. You can invite them again at any time.
          </p>

          <div className={styles.dialogActions}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={revokeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={revokeMutation.isPending}
              disabled={isReadOnly || revokeMutation.isPending}
              onClick={handleRevoke}
            >
              Revoke invitation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
