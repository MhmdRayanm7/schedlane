import { Plus, RefreshCw } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router";
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
import { Textarea } from "@/shared/components/ui/textarea";
import {
  useCreatePlatformOrganization,
  usePlatformOrganizations,
  useSuspendOrganization,
  useUnpublishOrganization,
  useUnsuspendOrganization,
} from "./hooks/use-platform";
import styles from "./platform.module.css";
import { platformOrganizationActions } from "./platform-organization-actions";
import type { PlatformOrganization } from "./types";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );

function State({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span className={styles.lifecycle} data-active={active}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function PlatformOrganizationsPage() {
  const query = usePlatformOrganizations();
  const navigate = useNavigate();
  const [unpublishTarget, setUnpublishTarget] =
    useState<PlatformOrganization | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [lifecycleTarget, setLifecycleTarget] = useState<{
    organization: PlatformOrganization;
    action: "suspend" | "unsuspend";
  } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Platform directory</p>
          <h1>Organizations</h1>
          <p>
            Lifecycle, publication, booking access, and ownership across
            Schedlane.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" /> Create organization
        </Button>
      </header>
      {successMessage ? (
        <InlineAlert variant="success">{successMessage}</InlineAlert>
      ) : null}
      {query.isPending ? (
        <p className={styles.queryState}>Loading organizations…</p>
      ) : null}
      {query.isError ? (
        <div className={styles.queryState}>
          <p>We couldn't load organizations.</p>
          <Button onClick={() => void query.refetch()} variant="outline">
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </div>
      ) : null}
      {!query.isPending && !query.isError && items.length === 0 ? (
        <div className={styles.empty}>
          <h2>No organizations yet</h2>
          <p>Approved workspace requests will appear here.</p>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Owner</th>
                <th>Created</th>
                <th>Publication</th>
                <th>Bookings</th>
                <th>Platform</th>
                <th>Organization</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((organization) => (
                <tr key={organization.id}>
                  <td>
                    <strong>{organization.name}</strong>
                    <small>/book/{organization.slug}</small>
                  </td>
                  <td>
                    {organization.owner ? (
                      <>
                        <span>{organization.owner.name}</span>
                        <small>{organization.owner.email}</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatDate(organization.createdAt)}</td>
                  <td>
                    <State
                      active={Boolean(organization.publishedAt)}
                      activeLabel="Published"
                      inactiveLabel="Unpublished"
                    />
                  </td>
                  <td>
                    <State
                      active={!organization.publicBookingPaused}
                      activeLabel="Open"
                      inactiveLabel="Paused"
                    />
                  </td>
                  <td>
                    <State
                      active={!organization.suspendedAt}
                      activeLabel="Active"
                      inactiveLabel="Suspended"
                    />
                  </td>
                  <td>
                    <State
                      active={!organization.archivedAt}
                      activeLabel="Active"
                      inactiveLabel="Archived"
                    />
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {platformOrganizationActions(organization).includes(
                        "review",
                      ) ? (
                        <Button
                          onClick={() =>
                            navigate(
                              `/platform/publications?request=${organization.pendingPublicationRequestId}`,
                            )
                          }
                          size="sm"
                          variant="outline"
                        >
                          Review
                        </Button>
                      ) : null}
                      {platformOrganizationActions(organization).includes(
                        "unpublish",
                      ) ? (
                        <Button
                          onClick={() => setUnpublishTarget(organization)}
                          size="sm"
                          variant="destructiveOutline"
                        >
                          Unpublish
                        </Button>
                      ) : null}
                      <Button
                        onClick={() =>
                          setLifecycleTarget({
                            organization,
                            action: organization.suspendedAt
                              ? "unsuspend"
                              : "suspend",
                          })
                        }
                        size="sm"
                        variant={
                          organization.suspendedAt
                            ? "outline"
                            : "destructiveOutline"
                        }
                      >
                        {organization.suspendedAt ? "Unsuspend" : "Suspend"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <UnpublishDialog
        onOpenChange={(open) => !open && setUnpublishTarget(null)}
        organization={unpublishTarget}
      />
      <CreateOrganizationDialog
        onCreated={(name) => {
          setSuccessMessage(`${name} was created successfully.`);
          setCreateOpen(false);
        }}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
      <OrganizationLifecycleDialog
        onOpenChange={(open) => !open && setLifecycleTarget(null)}
        target={lifecycleTarget}
      />
      {query.hasNextPage ? (
        <div className={styles.loadMore}>
          <Button
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
            variant="outline"
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}) {
  const mutation = useCreatePlatformOrganization();
  const [organizationName, setOrganizationName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOrganizationName("");
    setOwnerEmail("");
    setCustomerMessage("");
    setInternalNote("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = organizationName.trim();
    const email = ownerEmail.trim();
    if (!name || !email) {
      setError("Organization name and owner email are required.");
      return;
    }
    setError(null);
    try {
      await mutation.mutateAsync({
        organizationName: name,
        ownerEmail: email,
        ...(customerMessage.trim()
          ? { customerMessage: customerMessage.trim() }
          : {}),
        ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
      });
      reset();
      onCreated(name);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === "OWNER_ACCOUNT_NOT_FOUND") {
          setError("No verified Schedlane account exists for this email.");
          return;
        }
        if (caught.code === "ORGANIZATION_SLUG_UNAVAILABLE") {
          setError("A unique organization address could not be created.");
          return;
        }
      }
      setError("We couldn't create this organization. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (mutation.isPending) return;
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent aria-busy={mutation.isPending}>
        <DialogTitle>Create organization</DialogTitle>
        <DialogDescription>
          Create an unpublished workspace for an existing verified Schedlane
          user.
        </DialogDescription>
        <form onSubmit={submit}>
          <div className={styles.dialogBody}>
            <FormField
              htmlFor="create-organization-name"
              label="Organization name"
            >
              <Input
                autoFocus
                id="create-organization-name"
                maxLength={120}
                onChange={(event) => setOrganizationName(event.target.value)}
                required
                value={organizationName}
              />
            </FormField>
            <FormField htmlFor="create-owner-email" label="Owner email">
              <Input
                id="create-owner-email"
                maxLength={320}
                onChange={(event) => setOwnerEmail(event.target.value)}
                required
                type="email"
                value={ownerEmail}
              />
            </FormField>
            <FormField
              htmlFor="create-customer-message"
              label="Customer-facing message (optional)"
              helperText="Included in the workspace-created email."
            >
              <Textarea
                id="create-customer-message"
                maxLength={2000}
                onChange={(event) => setCustomerMessage(event.target.value)}
                rows={3}
                value={customerMessage}
              />
            </FormField>
            <FormField
              htmlFor="create-internal-note"
              label="Internal note (optional)"
              helperText="Visible only in Platform audit data. Never emailed to the customer."
            >
              <Textarea
                id="create-internal-note"
                maxLength={2000}
                onChange={(event) => setInternalNote(event.target.value)}
                rows={3}
                value={internalNote}
              />
            </FormField>
            {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
          </div>
          <div className={styles.dialogActions}>
            <Button
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              loadingLabel="Creating"
              type="submit"
            >
              Create organization
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrganizationLifecycleDialog({
  target,
  onOpenChange,
}: {
  target: {
    organization: PlatformOrganization;
    action: "suspend" | "unsuspend";
  } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const suspend = useSuspendOrganization();
  const unsuspend = useUnsuspendOrganization();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = suspend.isPending || unsuspend.isPending;
  const isSuspend = target?.action === "suspend";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    if (isSuspend && !note.trim()) {
      setError("A clear suspension reason is required.");
      return;
    }
    setError(null);
    try {
      if (isSuspend) {
        await suspend.mutateAsync({
          organizationId: target.organization.id,
          reason: note.trim(),
        });
      } else {
        await unsuspend.mutateAsync({
          organizationId: target.organization.id,
          ...(note.trim() ? { internalNote: note.trim() } : {}),
        });
      }
      setNote("");
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === "ORGANIZATION_ALREADY_SUSPENDED") {
          setError("This organization is already suspended.");
          return;
        }
        if (caught.code === "ORGANIZATION_NOT_SUSPENDED") {
          setError("This organization is already active.");
          return;
        }
        if (caught.code === "ORGANIZATION_NOT_FOUND") {
          setError("This organization no longer exists.");
          return;
        }
      }
      setError(
        `We couldn't ${isSuspend ? "suspend" : "unsuspend"} this organization.`,
      );
    }
  }

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open && !pending) {
          setNote("");
          setError(null);
          onOpenChange(false);
        }
      }}
    >
      <DialogContent aria-busy={pending}>
        <DialogTitle>
          {isSuspend ? "Suspend" : "Unsuspend"} {target?.organization.name}?
        </DialogTitle>
        <DialogDescription>
          {isSuspend
            ? "The workspace becomes read-only and public booking becomes unavailable. Existing data and publication settings are preserved."
            : "Workspace access will be restored. Existing publication and booking-page settings remain unchanged."}
        </DialogDescription>
        <form onSubmit={submit}>
          <div className={styles.dialogBody}>
            <FormField
              htmlFor="lifecycle-note"
              label={
                isSuspend
                  ? "Customer-facing reason"
                  : "Internal note (optional)"
              }
              helperText={
                isSuspend
                  ? "Included in the suspension email. Plain text only."
                  : "Stored in the Platform audit history and not emailed."
              }
            >
              <Textarea
                autoFocus
                id="lifecycle-note"
                maxLength={isSuspend ? 500 : 2000}
                onChange={(event) => setNote(event.target.value)}
                required={isSuspend}
                rows={4}
                value={note}
              />
            </FormField>
            {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
          </div>
          <div className={styles.dialogActions}>
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              loading={pending}
              loadingLabel={isSuspend ? "Suspending" : "Unsuspending"}
              type="submit"
              variant={isSuspend ? "destructive" : "default"}
            >
              {isSuspend ? "Suspend organization" : "Unsuspend organization"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UnpublishDialog({
  organization,
  onOpenChange,
}: {
  organization: PlatformOrganization | null;
  onOpenChange: (open: boolean) => void;
}) {
  const mutation = useUnpublishOrganization();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!organization || !reason.trim()) {
      setError("A clear reason is required.");
      return;
    }
    setError(null);
    try {
      await mutation.mutateAsync({
        organizationId: organization.id,
        reason: reason.trim(),
      });
      setReason("");
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError &&
          caught.code === "ORGANIZATION_NOT_PUBLISHED"
          ? "This organization is already unpublished."
          : "We couldn't unpublish this organization. Please try again.",
      );
    }
  }

  return (
    <Dialog
      open={Boolean(organization)}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
          setReason("");
          setError(null);
          onOpenChange(false);
        }
      }}
    >
      <DialogContent aria-busy={mutation.isPending}>
        <DialogTitle>Unpublish {organization?.name}?</DialogTitle>
        <DialogDescription>
          The booking page will no longer be live. Business configuration, pause
          state, suspension, and archive state remain unchanged.
        </DialogDescription>
        <form onSubmit={submit}>
          <div className={styles.dialogBody}>
            <FormField htmlFor="unpublish-reason" label="Reason">
              <Textarea
                autoFocus
                id="unpublish-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                value={reason}
              />
            </FormField>
            {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
          </div>
          <div className={styles.dialogActions}>
            <Button
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              loadingLabel="Unpublishing"
              type="submit"
              variant="destructive"
            >
              Unpublish
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
