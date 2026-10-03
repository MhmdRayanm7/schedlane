import { Check, CircleX, ExternalLink, RefreshCw } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Textarea } from "@/shared/components/ui/textarea";
import { usePageTitle } from "@/shared/lib/page-title";
import {
  usePlatformDecision,
  usePlatformRequest,
  usePlatformRequests,
} from "./hooks/use-platform";
import styles from "./platform.module.css";
import type { PlatformRequest, RequestStatus } from "./types";

const statuses: RequestStatus[] = ["pending", "approved", "rejected"];
const titleCase = (value: string) => value[0]?.toUpperCase() + value.slice(1);
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function slugSuggestion(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/g, "");
}

function Status({ status }: { status: RequestStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      {titleCase(status)}
    </span>
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DecisionDialog({
  request,
  action,
  open,
  onOpenChange,
}: {
  request: PlatformRequest;
  action: "approve" | "reject";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decisions = usePlatformDecision();
  const mutation = action === "approve" ? decisions.approve : decisions.reject;

  useEffect(() => {
    if (open) {
      setValue(action === "approve" ? slugSuggestion(request.name) : "");
      setError(null);
    }
  }, [action, open, request.name]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(
        action === "approve"
          ? "Choose a booking URL."
          : "A rejection reason is required.",
      );
      return;
    }
    try {
      if (action === "approve")
        await decisions.approve.mutateAsync({ id: request.id, slug: trimmed });
      else
        await decisions.reject.mutateAsync({ id: request.id, reason: trimmed });
      onOpenChange(false);
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.code === "ORGANIZATION_SLUG_TAKEN"
      ) {
        setError("That booking URL is already in use. Choose another slug.");
      } else if (
        caught instanceof ApiError &&
        caught.code === "ORGANIZATION_REQUEST_NOT_PENDING"
      ) {
        setError("This request has already been reviewed.");
      } else {
        setError("We couldn't save this decision. Please try again.");
      }
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-busy={mutation.isPending}>
        <DialogTitle>
          {action === "approve" ? "Approve request" : "Reject request"}
        </DialogTitle>
        <DialogDescription>
          {action === "approve"
            ? `Create an unpublished workspace for ${request.name}.`
            : `Share concise, useful feedback with ${request.requestedBy.name}.`}
        </DialogDescription>
        <form onSubmit={submit}>
          <div className={styles.dialogBody}>
            {action === "approve" ? (
              <FormField
                htmlFor="approval-slug"
                label="Booking URL"
                helperText={
                  <>
                    schedlane.com/book/<strong>{value || "your-slug"}</strong>
                  </>
                }
              >
                <Input
                  autoFocus
                  id="approval-slug"
                  maxLength={80}
                  onChange={(event) =>
                    setValue(event.target.value.toLowerCase())
                  }
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  value={value}
                />
              </FormField>
            ) : (
              <FormField htmlFor="rejection-reason" label="Reason">
                <Textarea
                  autoFocus
                  id="rejection-reason"
                  maxLength={500}
                  onChange={(event) => setValue(event.target.value)}
                  rows={4}
                  value={value}
                />
              </FormField>
            )}
            {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
          </div>
          <div className={styles.dialogActions}>
            <Button
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending}
              loading={mutation.isPending}
              loadingLabel={action === "approve" ? "Approving" : "Rejecting"}
              type="submit"
              variant={action === "reject" ? "destructive" : "default"}
            >
              {action === "approve" ? "Approve and create" : "Reject request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestDetails({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const query = usePlatformRequest(id);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const request = query.data;
  return (
    <>
      <Sheet
        onOpenChange={(open) => !open && onClose()}
        open={Boolean(id) && !decision}
      >
        <SheetContent>
          {query.isPending ? (
            <p className={styles.queryState}>Loading request…</p>
          ) : null}
          {query.isError ? (
            <div className={styles.queryState}>
              <p>We couldn't load this request.</p>
              <Button onClick={() => void query.refetch()} variant="outline">
                Try again
              </Button>
            </div>
          ) : null}
          {request ? (
            <div className={styles.details}>
              <SheetHeader>
                <div className={styles.detailHeading}>
                  <SheetTitle>{request.name}</SheetTitle>
                  <Status status={request.status} />
                </div>
                <SheetDescription>
                  Submitted {formatDateTime(request.createdAt)}
                </SheetDescription>
              </SheetHeader>
              <section>
                <h2>Applicant</h2>
                <dl className={styles.detailGrid}>
                  <DetailItem label="Name">
                    {request.requestedBy.name}
                  </DetailItem>
                  <DetailItem label="Email">
                    <a
                      className={styles.detailLink}
                      href={`mailto:${request.requestedBy.email}`}
                    >
                      {request.requestedBy.email}
                    </a>
                  </DetailItem>
                  {request.contactPhone ? (
                    <DetailItem label="Phone / WhatsApp">
                      <a
                        className={styles.detailLink}
                        href={`tel:${request.contactPhone}`}
                      >
                        {request.contactPhone}
                      </a>
                    </DetailItem>
                  ) : null}
                </dl>
              </section>
              <section>
                <h2>Request</h2>
                <dl className={styles.detailGrid}>
                  <DetailItem label="Description">
                    <span className={styles.longText}>
                      {request.description ??
                        "Legacy request — no description recorded"}
                    </span>
                  </DetailItem>
                  {request.additionalContext ? (
                    <DetailItem label="Additional information">
                      <span className={styles.longText}>
                        {request.additionalContext}
                      </span>
                    </DetailItem>
                  ) : null}
                  <DetailItem label="Setup help">
                    {request.wantsSetupHelp ? "Requested" : "Not requested"}
                  </DetailItem>
                  <DetailItem label="Request ID">
                    <code>{request.id}</code>
                  </DetailItem>
                </dl>
              </section>
              {request.rejectionReason ? (
                <section>
                  <h2>Decision</h2>
                  <p className={styles.longText}>{request.rejectionReason}</p>
                </section>
              ) : null}
              {request.status === "pending" ? (
                <div className={styles.detailActions}>
                  <Button onClick={() => setDecision("approve")}>
                    <Check aria-hidden="true" /> Approve
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
          open
          request={request}
        />
      ) : null}
    </>
  );
}

export function PlatformRequestsPage() {
  usePageTitle("Organization Requests");
  const [status, setStatus] = useState<RequestStatus>("pending");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("request");
  const query = usePlatformRequests(status);
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

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
          <p className={styles.eyebrow}>Workspace onboarding</p>
          <h1>Organization requests</h1>
          <p>Review applicants and provision approved workspaces.</p>
        </div>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Request status">
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
        <p className={styles.queryState}>Loading requests…</p>
      ) : null}
      {query.isError ? (
        <div className={styles.queryState}>
          <p>We couldn't load requests.</p>
          <Button onClick={() => void query.refetch()} variant="outline">
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </div>
      ) : null}
      {!query.isPending && !query.isError && items.length === 0 ? (
        <div className={styles.empty}>
          <h2>No {status} requests</h2>
          <p>Requests will appear here when their status matches this view.</p>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Applicant</th>
                <th>Submitted</th>
                <th>Setup help</th>
                <th>Status</th>
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
                      {request.name}
                    </button>
                  </td>
                  <td>
                    <span>{request.requestedBy.name}</span>
                    <small>{request.requestedBy.email}</small>
                  </td>
                  <td>{formatDateTime(request.createdAt)}</td>
                  <td>{request.wantsSetupHelp ? "Yes" : "No"}</td>
                  <td>
                    <Status status={request.status} />
                  </td>
                  <td>
                    <Button
                      aria-label={`Open ${request.name}`}
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
      <RequestDetails id={selectedId} onClose={() => select(null)} />
    </div>
  );
}
