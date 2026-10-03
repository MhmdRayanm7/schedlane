import { Check, CircleX, ExternalLink, RefreshCw, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { PublicationRequestStatus } from "@/features/publication/types";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Textarea } from "@/shared/components/ui/textarea";
import { usePageTitle } from "@/shared/lib/page-title";
import {
  usePlatformPublication,
  usePlatformPublicationDecision,
  usePlatformPublications,
} from "./hooks/use-platform";
import styles from "./platform.module.css";
import type { PlatformPublicationRequestDetail } from "./types";

const statuses: PublicationRequestStatus[] = [
  "pending",
  "approved",
  "rejected",
];
const titleCase = (value: string) => value[0]?.toUpperCase() + value.slice(1);
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function Status({ status }: { status: PublicationRequestStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      {titleCase(status)}
    </span>
  );
}

function readinessLabel(code: string) {
  return (
    {
      organization_active: "Organization active",
      platform_active: "Platform access active",
      active_service: "Active Service",
      active_resource: "Active Resource",
      service_resources: "Active Resource assignments",
      working_hours: "Working hours",
      service_prices: "Service prices",
    }[code] ?? code
  );
}

function DecisionDialog({
  action,
  request,
  onOpenChange,
}: {
  action: "publish" | "reject";
  request: PlatformPublicationRequestDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const decisions = usePlatformPublicationDecision();
  const mutation = action === "publish" ? decisions.publish : decisions.reject;
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setError(null);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (action === "reject" && !reason.trim()) {
      setError("A clear rejection reason is required.");
      return;
    }
    setError(null);
    try {
      if (action === "publish") await decisions.publish.mutateAsync(request.id);
      else
        await decisions.reject.mutateAsync({
          id: request.id,
          reason: reason.trim(),
        });
      onOpenChange(false);
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.code === "PUBLICATION_READINESS_CHANGED"
      )
        setError(
          "Readiness changed. Close this dialog and review the current blockers.",
        );
      else if (
        caught instanceof ApiError &&
        caught.code === "PUBLICATION_REQUEST_NOT_PENDING"
      )
        setError("This request has already been reviewed.");
      else setError("We couldn't save this decision. Please try again.");
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent aria-busy={mutation.isPending}>
        <DialogTitle>
          {action === "publish"
            ? "Publish booking page?"
            : "Reject publication request?"}
        </DialogTitle>
        <DialogDescription>
          {action === "publish"
            ? `${request.organizationName} will become publicly bookable when its other access gates are open.`
            : `Share concise feedback with ${request.requester.name}.`}
        </DialogDescription>
        <form onSubmit={submit}>
          <div className={styles.dialogBody}>
            {action === "reject" ? (
              <FormField htmlFor="publication-rejection-reason" label="Reason">
                <Textarea
                  autoFocus
                  id="publication-rejection-reason"
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  value={reason}
                />
              </FormField>
            ) : null}
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
              loadingLabel={action === "publish" ? "Publishing" : "Rejecting"}
              type="submit"
              variant={action === "reject" ? "destructive" : "default"}
            >
              {action === "publish" ? "Publish" : "Reject request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PublicationDetails({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const query = usePlatformPublication(id);
  const [decision, setDecision] = useState<"publish" | "reject" | null>(null);
  const request = query.data;
  return (
    <>
      <Sheet
        onOpenChange={(open) => !open && onClose()}
        open={Boolean(id) && !decision}
      >
        <SheetContent>
          {query.isPending ? (
            <p className={styles.queryState}>Loading publication request…</p>
          ) : null}
          {query.isError ? (
            <div className={styles.queryState}>
              <p>We couldn't load this publication request.</p>
              <Button onClick={() => void query.refetch()} variant="outline">
                Try again
              </Button>
            </div>
          ) : null}
          {request ? (
            <div className={styles.details}>
              <SheetHeader>
                <div className={styles.detailHeading}>
                  <SheetTitle>{request.organizationName}</SheetTitle>
                  <Status status={request.status} />
                </div>
                <SheetDescription>
                  Requested {formatDateTime(request.requestedAt)}
                </SheetDescription>
              </SheetHeader>
              <section>
                <h2>Request</h2>
                <dl className={styles.detailGrid}>
                  <div>
                    <dt>Booking path</dt>
                    <dd>/book/{request.slug}</dd>
                  </div>
                  <div>
                    <dt>Requester</dt>
                    <dd>
                      {request.requester.name}
                      <br />
                      {request.requester.email}
                    </dd>
                  </div>
                  <div>
                    <dt>Publication</dt>
                    <dd>{request.publishedAt ? "Published" : "Unpublished"}</dd>
                  </div>
                  <div>
                    <dt>Bookings</dt>
                    <dd>{request.publicBookingPaused ? "Paused" : "Open"}</dd>
                  </div>
                  <div>
                    <dt>Platform</dt>
                    <dd>{request.suspendedAt ? "Suspended" : "Active"}</dd>
                  </div>
                  <div>
                    <dt>Organization</dt>
                    <dd>{request.archivedAt ? "Archived" : "Active"}</dd>
                  </div>
                  <div>
                    <dt>Pricing</dt>
                    <dd>{request.pricingEnabled ? "On" : "Off"}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h2>Current readiness</h2>
                <ul className={styles.reviewChecklist}>
                  {request.readiness?.checks.map((check) => (
                    <li data-ready={check.ready} key={check.code}>
                      {check.ready ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <X aria-hidden="true" />
                      )}
                      <span>
                        {readinessLabel(check.code)}
                        {!check.ready && check.services?.length
                          ? ` — ${check.services.map((service) => service.serviceName).join(", ")}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              {request.rejectionReason ? (
                <section>
                  <h2>Decision feedback</h2>
                  <p className={styles.longText}>{request.rejectionReason}</p>
                </section>
              ) : null}
              {request.status === "pending" ? (
                <div className={styles.detailActions}>
                  <Button onClick={() => setDecision("publish")}>
                    <Check aria-hidden="true" /> Publish
                  </Button>
                  <Button
                    onClick={() => setDecision("reject")}
                    variant="destructiveOutline"
                  >
                    <CircleX aria-hidden="true" /> Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
      {request && decision ? (
        <DecisionDialog
          action={decision}
          onOpenChange={(open) => !open && setDecision(null)}
          request={request}
        />
      ) : null}
    </>
  );
}

export function PlatformPublicationsPage() {
  usePageTitle("Publications");
  const [status, setStatus] = useState<PublicationRequestStatus>("pending");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("request");
  const query = usePlatformPublications(status);
  const items = query.data?.items ?? [];

  function select(id: string | null) {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("request", id);
    else next.delete("request");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Publication review</p>
          <h1>Publications</h1>
          <p>Review booking-page readiness and decide public eligibility.</p>
        </div>
      </header>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Publication request status"
      >
        {statuses.map((item) => (
          <button
            aria-selected={status === item}
            key={item}
            onClick={() => setStatus(item)}
            role="tab"
            type="button"
          >
            {titleCase(item)}
          </button>
        ))}
      </div>
      {query.isPending ? (
        <p className={styles.queryState}>Loading publication requests…</p>
      ) : null}
      {query.isError ? (
        <div className={styles.queryState}>
          <p>We couldn't load publication requests.</p>
          <Button onClick={() => void query.refetch()} variant="outline">
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </div>
      ) : null}
      {!query.isPending && !query.isError && items.length === 0 ? (
        <div className={styles.empty}>
          <h2>No {status} publication requests</h2>
          <p>Requests will appear here when their status matches this view.</p>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Requester</th>
                <th>Requested</th>
                <th>Readiness</th>
                <th>Publication</th>
                <th>
                  <span className={styles.srOnly}>Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((request) => (
                <tr key={request.id}>
                  <td>
                    <button
                      className={styles.rowButton}
                      onClick={() => select(request.id)}
                      type="button"
                    >
                      {request.organizationName}
                    </button>
                    <small>/book/{request.slug}</small>
                  </td>
                  <td>
                    <span>{request.requester.name}</span>
                    <small>{request.requester.email}</small>
                  </td>
                  <td>{formatDateTime(request.requestedAt)}</td>
                  <td>
                    <span
                      className={styles.lifecycle}
                      data-active={request.readiness?.ready === true}
                    >
                      {request.readiness?.ready ? "Ready" : "Needs attention"}
                    </span>
                  </td>
                  <td>{request.publishedAt ? "Published" : "Unpublished"}</td>
                  <td>
                    <Button
                      aria-label={`Open ${request.organizationName}`}
                      onClick={() => select(request.id)}
                      size="icon"
                      variant="ghost"
                    >
                      <ExternalLink aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <PublicationDetails id={selectedId} onClose={() => select(null)} />
    </div>
  );
}
