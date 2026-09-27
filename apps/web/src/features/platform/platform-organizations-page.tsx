import { RefreshCw } from "lucide-react";
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
import { Textarea } from "@/shared/components/ui/textarea";
import {
  usePlatformOrganizations,
  useUnpublishOrganization,
} from "./hooks/use-platform";
import styles from "./platform.module.css";
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
      </header>
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
                      {organization.pendingPublicationRequestId ? (
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
                      {organization.publishedAt ? (
                        <Button
                          onClick={() => setUnpublishTarget(organization)}
                          size="sm"
                          variant="destructiveOutline"
                        >
                          Unpublish
                        </Button>
                      ) : null}
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
