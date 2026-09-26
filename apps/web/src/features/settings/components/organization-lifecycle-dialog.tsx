import { useState } from "react";
import type { Organization } from "@/features/organizations/types";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import {
  useArchiveOrganization,
  useRestoreOrganization,
} from "../hooks/use-organization-settings";
import styles from "../settings.module.css";
import { settingsActionError } from "../settings-errors";

export function OrganizationLifecycleDialog({
  action,
  onOpenChange,
  organization,
}: {
  action: "archive" | "restore" | null;
  onOpenChange: (open: boolean) => void;
  organization: Organization;
}) {
  const [error, setError] = useState<string | null>(null);
  const archiveMutation = useArchiveOrganization(organization.id);
  const restoreMutation = useRestoreOrganization(organization.id);
  const mutation = action === "archive" ? archiveMutation : restoreMutation;
  const isArchive = action === "archive";

  async function confirm() {
    if (!action || mutation.isPending) return;
    setError(null);
    try {
      await mutation.mutateAsync();
      onOpenChange(false);
    } catch (caught) {
      setError(
        settingsActionError(
          caught,
          isArchive
            ? "We couldn't archive this organization."
            : "We couldn't restore this organization.",
        ),
      );
    }
  }

  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (mutation.isPending) return;
        if (!open) {
          setError(null);
          onOpenChange(false);
        }
      }}
    >
      <DialogContent aria-busy={mutation.isPending}>
        <DialogTitle>
          {isArchive ? "Archive organization?" : "Restore organization?"}
        </DialogTitle>
        <DialogDescription>
          {isArchive
            ? `${organization.name} will become read-only and unavailable for public booking. Existing data will be preserved.`
            : "Restoring makes the organization editable again. Public publication is not automatically restored."}
        </DialogDescription>
        {error ? (
          <InlineAlert className={styles.dialogAlert} variant="error">
            {error}
          </InlineAlert>
        ) : null}
        <div className={styles.dialogActions}>
          <DialogClose asChild>
            <Button disabled={mutation.isPending} variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={mutation.isPending}
            loading={mutation.isPending}
            loadingLabel={isArchive ? "Archiving…" : "Restoring…"}
            onClick={() => void confirm()}
            variant={isArchive ? "destructive" : "default"}
          >
            {isArchive ? "Archive organization" : "Restore organization"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
