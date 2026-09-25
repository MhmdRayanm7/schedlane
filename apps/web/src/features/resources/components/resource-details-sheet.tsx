import { AlertCircle, Link2, Unlink2, UserCheck } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/cn";
import {
  useLinkResource,
  useResourceLinkCandidates,
  useUnlinkResource,
} from "../hooks/use-resources";
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
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-[#eef1f0] text-foreground">
      {label}
    </span>
  );
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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                  isActive
                    ? "bg-[#e8f5e9] text-[#2e7d32]"
                    : "bg-[#f1f3f4] text-[#5f6368]",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isActive ? "bg-[#2e7d32]" : "bg-[#9aa0a6]",
                  )}
                  aria-hidden="true"
                />
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <SheetTitle className="text-xl font-semibold text-foreground">
              {resource.name}
            </SheetTitle>
            <SheetDescription>
              Resource details, lifecycle, and team member linking.
            </SheetDescription>
          </SheetHeader>

          {actionError ? (
            <div
              className="mt-4 rounded-md border border-[#e7b7b2] bg-[#fdf3f2] p-3 text-sm text-destructive"
              role="alert"
            >
              {actionError}
            </div>
          ) : null}

          {/* Lifecycle actions */}
          {!isReadOnly ? (
            <div className="mt-5 flex gap-2.5">
              {isActive ? (
                <Button
                  variant="destructiveOutline"
                  size="sm"
                  onClick={() => setDeactivateDialogOpen(true)}
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
                  className="text-primary hover:bg-primary-subtle"
                >
                  Reactivate resource
                </Button>
              )}
            </div>
          ) : null}

          {/* Member Linking Section */}
          <section
            aria-labelledby="member-linking-heading"
            className="mt-8 border-t border-border pt-6"
          >
            <h3
              id="member-linking-heading"
              className="text-sm font-semibold text-foreground"
            >
              Team member link
            </h3>
            <p className="mt-1 text-xs text-muted-foreground leading-normal">
              Linking a resource to a team member lets them manage and receive
              appointments.
            </p>

            <div className="mt-4">
              {candidatesQuery.isPending ? (
                <div aria-busy="true" className="space-y-2 py-2" role="status">
                  <div className="h-4 w-40 rounded bg-border animate-pulse" />
                  <div className="h-10 w-full rounded bg-border/60 animate-pulse" />
                </div>
              ) : candidatesQuery.isError ? (
                <p className="text-xs text-destructive">
                  Could not load team linking information.
                </p>
              ) : linkData ? (
                <div className="space-y-4">
                  {/* Pending invitation warning */}
                  {linkData.pendingInvitation ? (
                    <div
                      className="flex items-start gap-2.5 rounded-lg border border-[#ead9aa] bg-[#fffaf0] p-3 text-xs text-[#725b18]"
                      role="alert"
                    >
                      <AlertCircle className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">
                          Pending invitation conflict:
                        </span>{" "}
                        An active staff invitation for{" "}
                        <strong>{linkData.pendingInvitation.email}</strong> is
                        reserved for this resource. Revoke the invitation in
                        Team before linking an existing member.
                      </div>
                    </div>
                  ) : null}

                  {/* Current link state */}
                  {linkData.currentLink ? (
                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserCheck
                            aria-hidden="true"
                            className="size-4 text-primary shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-foreground truncate">
                                {linkData.currentLink.name}
                              </span>
                              {roleBadge(linkData.currentLink.role)}
                            </div>
                            <span className="text-xs text-muted-foreground truncate block">
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
                            <Unlink2 aria-hidden="true" className="size-3.5" />
                            {unlinkMutation.isPending ? "Unlinking…" : "Unlink"}
                          </Button>
                        ) : null}
                      </div>

                      {!linkData.currentLink.canManage ? (
                        <p className="mt-2 text-xs text-subtle-foreground">
                          Only an organization owner can change or unlink this
                          member.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    /* Unlinked state */
                    <div className="space-y-3">
                      {!isActive ? (
                        <p className="text-xs text-muted-foreground rounded-lg border border-border bg-background p-3">
                          This resource is deactivated. Reactivate it above
                          before linking a member.
                        </p>
                      ) : linkData.pendingInvitation ? (
                        <p className="text-xs text-muted-foreground">
                          Clear the pending invitation above to link an existing
                          member.
                        </p>
                      ) : linkData.candidates.length === 0 ? (
                        <p className="text-xs text-muted-foreground rounded-lg border border-border bg-background p-3">
                          No available team members to link. Each member can
                          only be linked to one resource.
                        </p>
                      ) : !isReadOnly ? (
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <label
                              htmlFor="link-member-select"
                              className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                            >
                              Select member to link
                            </label>
                            <select
                              id="link-member-select"
                              className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground transition-colors duration-150 outline-none hover:border-[#bcc6c3] focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
                          </div>

                          <Button
                            size="sm"
                            onClick={handleLink}
                            disabled={
                              !selectedMembershipId || linkMutation.isPending
                            }
                          >
                            <Link2 aria-hidden="true" className="size-3.5" />
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

      {/* Deactivation Confirmation Dialog */}
      <Dialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
      >
        <DialogContent>
          <DialogTitle>Deactivate resource</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate "{resource.name}"? It will no
            longer be available for new bookings. Existing appointments and
            member links are retained.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-3">
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
