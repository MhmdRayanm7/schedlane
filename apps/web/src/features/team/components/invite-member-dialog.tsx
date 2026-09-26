import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useResources } from "@/features/resources/hooks/use-resources";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { FormField } from "@/shared/components/ui/form-field";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useInviteMember, useTeamInvitations } from "../hooks/use-team";
import styles from "../team.module.css";
import type { MembershipRole } from "../types";

type InviteMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  viewerRole: MembershipRole;
  initialValues?: {
    email?: string;
    role?: MembershipRole;
    resourceId?: string | null;
  } | null;
  isReadOnly: boolean;
};

function getAvailableRoles(viewerRole: MembershipRole): MembershipRole[] {
  return viewerRole === "owner" ? ["owner", "manager", "staff"] : ["staff"];
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  organizationId,
  viewerRole,
  initialValues,
  isReadOnly,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MembershipRole>("staff");
  const [resourceId, setResourceId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inviteMutation = useInviteMember(organizationId);
  const resourcesQuery = useResources(organizationId);
  const invitationsQuery = useTeamInvitations(organizationId, {
    enabled: open && viewerRole !== "staff",
  });

  // Derive candidate resources: active, !isLinked, and not reserved by a pending invitation
  const candidateResources = useMemo(() => {
    const resources = resourcesQuery.data?.items ?? [];
    const pendingInvitations = invitationsQuery.data?.items ?? [];
    const pendingResourceIds = new Set(
      pendingInvitations
        .filter((i) => i.status === "pending" && i.resourceId)
        .map((i) => i.resourceId as string),
    );

    return resources.filter((resource) => {
      if (resource.deactivatedAt) return false;
      if (resource.isLinked) return false;
      // Allow the resource if it's the prefilled one from an expired invitation
      if (
        initialValues?.resourceId &&
        resource.id === initialValues.resourceId
      ) {
        return true;
      }
      return !pendingResourceIds.has(resource.id);
    });
  }, [
    resourcesQuery.data?.items,
    invitationsQuery.data?.items,
    initialValues?.resourceId,
  ]);

  useEffect(() => {
    if (open) {
      const allowedRoles = getAvailableRoles(viewerRole);
      if (initialValues) {
        setEmail(initialValues.email ?? "");
        setRole(
          initialValues.role && allowedRoles.includes(initialValues.role)
            ? initialValues.role
            : allowedRoles[0],
        );
        setResourceId(initialValues.resourceId ?? "");
      } else {
        setEmail("");
        setRole(allowedRoles[0]);
        setResourceId("");
      }
      setErrorMessage(null);
    }
  }, [open, initialValues, viewerRole]);

  // When candidate resources load or role changes to staff, auto-select if single candidate
  useEffect(() => {
    if (role === "staff" && candidateResources.length === 1 && !resourceId) {
      setResourceId(candidateResources[0].id);
    }
  }, [role, candidateResources, resourceId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isReadOnly || inviteMutation.isPending) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage("Email address is required.");
      return;
    }

    if (role === "staff" && !resourceId) {
      setErrorMessage("Please select a Resource for this Staff member.");
      return;
    }

    setErrorMessage(null);

    try {
      await inviteMutation.mutateAsync({
        email: trimmedEmail,
        role,
        ...(role === "staff" && resourceId ? { resourceId } : {}),
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "ORGANIZATION_MEMBER_ALREADY_EXISTS":
            setErrorMessage(
              "A member with this email already belongs to this organization.",
            );
            return;
          case "ORGANIZATION_INVITATION_ALREADY_PENDING":
            setErrorMessage(
              "An active invitation has already been sent to this email address.",
            );
            return;
          case "STAFF_INVITATION_RESOURCE_REQUIRED":
            setErrorMessage("Please select a Resource for this Staff member.");
            return;
          case "INVITATION_RESOURCE_NOT_ALLOWED":
            setErrorMessage(
              "Resources can only be assigned to Staff invitations.",
            );
            return;
          case "RESOURCE_NOT_FOUND":
            setErrorMessage("The selected Resource was not found.");
            return;
          case "RESOURCE_DEACTIVATED":
            setErrorMessage("The selected Resource is deactivated.");
            return;
          case "RESOURCE_ALREADY_LINKED":
            setErrorMessage(
              "The selected Resource is already linked to another member.",
            );
            return;
          case "RESOURCE_INVITATION_ALREADY_PENDING":
            setErrorMessage(
              "An active invitation already targets this Resource.",
            );
            return;
          case "INVITATION_EMAIL_DELIVERY_FAILED":
            setErrorMessage(
              "The invitation email could not be delivered. Please check the address and try again.",
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
            setErrorMessage(error.message || "Failed to send invitation.");
            return;
        }
      }
      setErrorMessage("An unexpected error occurred. Please try again.");
    }
  }

  const noStaffResources = role === "staff" && candidateResources.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!inviteMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        aria-busy={inviteMutation.isPending}
        className={styles.dialogContent}
      >
        <header className={styles.dialogHeader}>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Send an email invitation to join this organization.
          </DialogDescription>
        </header>

        <form onSubmit={handleSubmit} className={styles.dialogForm}>
          {errorMessage ? (
            <InlineAlert variant="error">{errorMessage}</InlineAlert>
          ) : null}

          <FormField htmlFor="invite-email" label="Email address">
            <Input
              id="invite-email"
              type="email"
              required
              autoComplete="email"
              disabled={isReadOnly || inviteMutation.isPending}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
            />
          </FormField>

          <FormField htmlFor="invite-role" label="Role">
            {viewerRole === "manager" ? (
              <Input
                id="invite-role"
                type="text"
                disabled
                value="Staff"
                readOnly
              />
            ) : (
              <Select
                value={role}
                onValueChange={(val) => {
                  setRole(val as MembershipRole);
                  if (val !== "staff") {
                    setResourceId("");
                  }
                }}
                disabled={isReadOnly || inviteMutation.isPending}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>

          {role === "staff" ? (
            <FormField htmlFor="invite-resource" label="Resource">
              {noStaffResources ? (
                <div className={styles.resourceHelp}>
                  <span>
                    No available Resources. Staff members need an active,
                    unlinked Resource.
                  </span>
                  <Link
                    to={`/app/${organizationId}/resources`}
                    onClick={() => onOpenChange(false)}
                    className={styles.resourceHelpLink}
                  >
                    Go to Resources
                  </Link>
                </div>
              ) : (
                <Select
                  value={resourceId}
                  onValueChange={setResourceId}
                  disabled={isReadOnly || inviteMutation.isPending}
                >
                  <SelectTrigger id="invite-resource">
                    <SelectValue placeholder="Select a resource…" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateResources.map((resource) => (
                      <SelectItem key={resource.id} value={resource.id}>
                        {resource.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          ) : null}

          <div className={styles.dialogActions}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={inviteMutation.isPending}
              disabled={
                isReadOnly || inviteMutation.isPending || noStaffResources
              }
            >
              Send invitation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
