import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { useLeaveOrganization } from "../hooks/use-team";
import styles from "../team.module.css";
import type { MembershipRole } from "../types";

type LeaveOrganizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  viewerRole: MembershipRole;
  ownersCount: number;
  isReadOnly: boolean;
};

export function LeaveOrganizationDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  viewerRole,
  ownersCount,
  isReadOnly,
}: LeaveOrganizationDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const leaveMutation = useLeaveOrganization(organizationId);
  const navigate = useNavigate();

  const isLastOwner = viewerRole === "owner" && ownersCount <= 1;

  async function handleLeave() {
    if (isReadOnly || leaveMutation.isPending || isLastOwner) return;

    setErrorMessage(null);

    try {
      await leaveMutation.mutateAsync();
      onOpenChange(false);
      navigate("/app", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "ORGANIZATION_LAST_OWNER_REQUIRED":
            setErrorMessage(
              "The organization must keep at least one Owner before you can leave.",
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
              error.message || "Failed to leave the organization.",
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
        if (!leaveMutation.isPending) {
          setErrorMessage(null);
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent
        aria-busy={leaveMutation.isPending}
        className={styles.dialogContent}
      >
        <header className={styles.dialogHeader}>
          <DialogTitle>Leave organization?</DialogTitle>
          <DialogDescription>
            You are leaving <strong>{organizationName}</strong>.
          </DialogDescription>
        </header>

        <div className={styles.dialogForm}>
          {errorMessage ? (
            <InlineAlert variant="error">{errorMessage}</InlineAlert>
          ) : null}

          {isLastOwner ? (
            <InlineAlert variant="warning">
              Add another Owner before leaving this organization.
            </InlineAlert>
          ) : (
            <p className={styles.radioDescription}>
              You will lose access to this organization immediately. If your
              account is linked to a Resource, the Resource stays in the
              organization but the account link is removed.
            </p>
          )}

          <div className={styles.dialogActions}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={leaveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={leaveMutation.isPending}
              disabled={isReadOnly || leaveMutation.isPending || isLastOwner}
              onClick={handleLeave}
            >
              Leave organization
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
