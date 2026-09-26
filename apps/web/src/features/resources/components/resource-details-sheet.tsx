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
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-surface-hover text-foreground">
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
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium",
                  isActive
                    ? "bg-primary-subtle text-primary"
                    : "bg-background text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isActive ? "bg-primary" : "bg-subtle-foreground",
                  )}
                  aria-hidden="true"
                />
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <SheetTitle className="text-xl font-semibold text-foreground">
              {resource.name}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Resource details
            </SheetDescription>
          </SheetHeader>

          {actionError ? (
            <div
              className="mt-4 rounded-md border border-destructive/25 bg-destructive-subtle p-3 text-sm text-destructive"
              role="alert"
            >
              {actionError}
            </div>
          ) : null}

          {!isReadOnly ? (
            <div className="mt-5 flex gap-2.5">
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
                  className="text-primary hover:bg-primary-subtle"
                >
                  Reactivate resource
                </Button>
              )}
            </div>
          ) : null}

          <section
            aria-labelledby="member-linking-heading"
            className="mt-6 border-t border-border pt-5"
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
                  {linkData.pendingInvitation ? (
                    <div
                      className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-subtle p-3 text-xs text-warning"
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

                  {linkData.currentLink ? (
                    <div className="border-y border-border py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserCheck
                            aria-hidden="true"
                            className="size-4 text-primary shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm text-foreground [overflow-wrap:anywhere]">
                                {linkData.currentLink.name}
                              </span>
                              {roleBadge(linkData.currentLink.role)}
                            </div>
                            <span className="text-xs text-muted-foreground [overflow-wrap:anywhere] block">
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
                              className="block text-sm font-medium text-foreground"
                            >
                              Select member to link
                            </label>
                            <select
                              id="link-member-select"
                              className="h-10 min-w-0 w-full rounded-md border border-border-strong bg-surface [@media(pointer:coarse)]:text-base px-3 text-sm text-foreground transition-colors duration-150 outline-none enabled:hover:border-muted-foreground focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
            <p
              role="alert"
              className="mt-4 rounded-md border border-destructive/25 bg-destructive-subtle p-3 text-sm text-destructive"
            >
              {actionError}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
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
