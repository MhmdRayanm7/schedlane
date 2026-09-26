import { AlertCircle, Link2, Unlink2, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { FormField } from "@/shared/components/ui/form-field";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  useLinkResource,
  useResourceLinkCandidates,
  useUnlinkResource,
} from "../hooks/use-resources";
import styles from "../resources.module.css";
import type { Resource } from "../types";

type ResourceDetailsSheetProps = {
  resource: Resource | null;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeactivate: (resourceId: string) => Promise<void>;
  onReactivate: (resourceId: string) => Promise<void>;
  isReadOnly: boolean;
  isActionPending?: boolean;
};

function roleBadge(role: string) {
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return <span className={styles.roleBadge}>{label}</span>;
}

export function ResourceDetailsSheet({
  resource,
  organizationId,
  open,
  onOpenChange,
  onDeactivate,
  onReactivate,
  isReadOnly,
  isActionPending = false,
}: ResourceDetailsSheetProps) {
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setActionError(null);
    setSelectedMembershipId("");
  }, [open]);

  const isActive = resource ? resource.deactivatedAt === null : false;

  const candidatesQuery = useResourceLinkCandidates(
    organizationId,
    resource?.id ?? "",
    open && Boolean(resource),
  );

  const linkMutation = useLinkResource(organizationId, resource?.id ?? "");
  const unlinkMutation = useUnlinkResource(organizationId, resource?.id ?? "");

  if (!resource) return null;

  async function handleConfirmDeactivate() {
    if (!resource || isReadOnly || isActionPending) return;
    setActionError(null);
    try {
      await onDeactivate(resource.id);
      setDeactivateDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message || "Failed to deactivate resource.");
      } else {
        setActionError("An unexpected error occurred.");
      }
    }
  }

  async function handleReactivate() {
    if (!resource || isReadOnly || isActionPending) return;
    setActionError(null);
    try {
      await onReactivate(resource.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message || "Failed to reactivate resource.");
      } else {
        setActionError("An unexpected error occurred.");
      }
    }
  }

  async function handleLink() {
    if (!selectedMembershipId || isReadOnly || linkMutation.isPending) return;
    setActionError(null);
    try {
      await linkMutation.mutateAsync(selectedMembershipId);
      setSelectedMembershipId("");
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case "RESOURCE_INVITATION_PENDING":
            setActionError(
              "Revoke the active Staff invitation before linking this Resource.",
            );
            return;
          case "RESOURCE_ALREADY_LINKED":
            setActionError(
              "This resource is already linked to another member.",
            );
            return;
          case "MEMBER_RESOURCE_ALREADY_LINKED":
            setActionError(
              "This team member is already linked to another resource.",
            );
            return;
          case "RESOURCE_DEACTIVATED":
            setActionError("Deactivated resources cannot be linked.");
            return;
          case "RESOURCE_MANAGEMENT_NOT_ALLOWED":
            setActionError(
              "Your organization role does not allow linking this member.",
            );
            return;
          default:
            setActionError(err.message || "Failed to link member.");
            return;
        }
      }
      setActionError("Failed to link member. Please try again.");
    }
  }

  async function handleUnlink() {
    if (isReadOnly || unlinkMutation.isPending) return;
    setActionError(null);
    try {
      await unlinkMutation.mutateAsync();
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case "RESOURCE_MANAGEMENT_NOT_ALLOWED":
            setActionError(
              "Your organization role does not allow unlinking this member.",
            );
            return;
          default:
            setActionError(err.message || "Failed to unlink member.");
            return;
        }
      }
      setActionError("Failed to unlink member. Please try again.");
    }
  }

  const linkData = candidatesQuery.data;

  return (
    <>
      <Sheet open={open && !deactivateDialogOpen} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <div className={styles.statusLine}>
              <span className={styles.statusBadge} data-active={isActive}>
                <span className={styles.statusBadgeDot} aria-hidden="true" />
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <SheetTitle className={styles.sheetTitle}>
              {resource.name}
            </SheetTitle>
            <SheetDescription className={styles.visuallyHidden}>
              Resource details
            </SheetDescription>
          </SheetHeader>

          {actionError ? (
            <InlineAlert variant="error" className={styles.sheetAlert}>
              {actionError}
            </InlineAlert>
          ) : null}

          {!isReadOnly ? (
            <div className={styles.sheetActions}>
              {isActive ? (
                <Button
                  variant="destructiveOutline"
                  size="sm"
                  onClick={() => {
                    setActionError(null);
                    setDeactivateDialogOpen(true);
                  }}
                  disabled={isActionPending}
                >
                  Deactivate resource
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReactivate}
                  disabled={isActionPending}
                  className={styles.reactivate}
                >
                  Reactivate resource
                </Button>
              )}
            </div>
          ) : null}

          <section
            aria-labelledby="member-linking-heading"
            className={styles.linkingSection}
          >
            <h3 id="member-linking-heading" className={styles.sectionTitle}>
              Team member link
            </h3>
            <p className={styles.sectionDescription}>
              Linking a resource to a team member lets them manage and receive
              appointments.
            </p>

            <div className={styles.linkingContent}>
              {candidatesQuery.isPending ? (
                <div aria-busy="true" className={styles.loading} role="status">
                  <div
                    className={`${styles.skeleton} ${styles.loadingTitle}`}
                  />
                  <div
                    className={`${styles.skeleton} ${styles.loadingControl}`}
                  />
                </div>
              ) : candidatesQuery.isError ? (
                <p className={styles.error}>
                  Could not load team linking information.
                </p>
              ) : linkData ? (
                <div className={styles.linkingStates}>
                  {linkData.pendingInvitation ? (
                    <InlineAlert variant="warning" className={styles.warning}>
                      <AlertCircle className={styles.warningIcon} />
                      <div>
                        <span className={styles.warningLabel}>
                          Pending invitation conflict:
                        </span>{" "}
                        An active staff invitation for{" "}
                        <strong>{linkData.pendingInvitation.email}</strong> is
                        reserved for this resource. Revoke the invitation in
                        Team before linking an existing member.
                      </div>
                    </InlineAlert>
                  ) : null}

                  {linkData.currentLink ? (
                    <div className={styles.currentLink}>
                      <div className={styles.currentLinkRow}>
                        <div className={styles.memberSummary}>
                          <UserCheck
                            aria-hidden="true"
                            className={styles.memberIcon}
                          />
                          <div className={styles.memberCopy}>
                            <div className={styles.memberNameLine}>
                              <span className={styles.memberName}>
                                {linkData.currentLink.name}
                              </span>
                              {roleBadge(linkData.currentLink.role)}
                            </div>
                            <span className={styles.memberEmail}>
                              {linkData.currentLink.email}
                            </span>
                          </div>
                        </div>

                        {!isReadOnly && linkData.currentLink.canManage ? (
                          <Button
                            variant="destructiveOutline"
                            size="sm"
                            onClick={handleUnlink}
                            disabled={unlinkMutation.isPending}
                          >
                            <Unlink2
                              aria-hidden="true"
                              className={styles.smallIcon}
                            />
                            {unlinkMutation.isPending ? "Unlinking…" : "Unlink"}
                          </Button>
                        ) : null}
                      </div>

                      {!linkData.currentLink.canManage ? (
                        <p className={styles.ownerHint}>
                          Only an organization owner can change or unlink this
                          member.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    /* Unlinked state */
                    <div className={styles.unlinkedState}>
                      {!isActive ? (
                        <p className={styles.hintBox}>
                          This resource is deactivated. Reactivate it above
                          before linking a member.
                        </p>
                      ) : linkData.pendingInvitation ? (
                        <p className={styles.hint}>
                          Clear the pending invitation above to link an existing
                          member.
                        </p>
                      ) : linkData.candidates.length === 0 ? (
                        <p className={styles.hintBox}>
                          No available team members to link. Each member can
                          only be linked to one resource.
                        </p>
                      ) : !isReadOnly ? (
                        <div className={styles.linkForm}>
                          <FormField
                            htmlFor="link-member-select"
                            label="Select member to link"
                          >
                            <select
                              id="link-member-select"
                              className={styles.nativeSelect}
                              value={selectedMembershipId}
                              onChange={(e) =>
                                setSelectedMembershipId(e.target.value)
                              }
                              disabled={linkMutation.isPending}
                            >
                              <option value="">Choose a team member…</option>
                              {linkData.candidates.map((candidate) => (
                                <option
                                  key={candidate.membershipId}
                                  value={candidate.membershipId}
                                >
                                  {candidate.name} ({candidate.email}) —{" "}
                                  {candidate.role.charAt(0).toUpperCase() +
                                    candidate.role.slice(1)}
                                </option>
                              ))}
                            </select>
                          </FormField>

                          <Button
                            size="sm"
                            onClick={handleLink}
                            disabled={
                              !selectedMembershipId || linkMutation.isPending
                            }
                          >
                            <Link2
                              aria-hidden="true"
                              className={styles.smallIcon}
                            />
                            {linkMutation.isPending
                              ? "Linking…"
                              : "Link member"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </SheetContent>
      </Sheet>

      <Dialog
        open={deactivateDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!isActionPending) setDeactivateDialogOpen(nextOpen);
        }}
      >
        <DialogContent aria-busy={isActionPending}>
          <DialogTitle>Deactivate resource</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate "{resource.name}"? It will no
            longer be available for new bookings. Existing appointments and
            member links are retained.
          </DialogDescription>
          {actionError ? (
            <InlineAlert as="p" variant="error" className={styles.sheetAlert}>
              {actionError}
            </InlineAlert>
          ) : null}
          <div className={styles.dialogActions}>
            <DialogClose asChild>
              <Button variant="outline" disabled={isActionPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleConfirmDeactivate}
              disabled={isActionPending}
            >
              {isActionPending ? "Deactivating…" : "Deactivate resource"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
