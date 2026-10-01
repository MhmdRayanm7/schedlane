import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useResources } from "@/features/resources/hooks/use-resources";
import {
  useServiceResources,
  useServices,
} from "@/features/services/hooks/use-services";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  useBookingShareLinks,
  useCreateBookingShareLink,
  useRevokeBookingShareLink,
} from "../hooks/use-organization-settings";
import styles from "../settings.module.css";
import type { BookingShareLink } from "../types";

type ScopeKind = "service" | "resource" | "both";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );

function linkUrl(slug: string, token: string) {
  return `${window.location.origin}/book/${slug}?share=${encodeURIComponent(token)}`;
}

function scopeSummary(link: BookingShareLink) {
  if (link.serviceName && link.resourceName)
    return {
      title: `${link.serviceName} · ${link.resourceName}`,
      kind: "Service + Resource",
    };
  if (link.serviceName) return { title: link.serviceName, kind: "Service" };
  return { title: link.resourceName ?? "Unavailable target", kind: "Resource" };
}

function CreateShareLinkDialog({
  open,
  onOpenChange,
  organizationId,
  slug,
  isReadOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  slug: string;
  isReadOnly: boolean;
}) {
  const servicesQuery = useServices(organizationId);
  const resourcesQuery = useResources(organizationId);
  const createMutation = useCreateBookingShareLink(organizationId);
  const [scope, setScope] = useState<ScopeKind>("service");
  const [serviceId, setServiceId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [created, setCreated] = useState<BookingShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignmentsQuery = useServiceResources(
    organizationId,
    serviceId,
    open && scope === "both" && Boolean(serviceId),
  );
  const services = (servicesQuery.data?.items ?? []).filter(
    (service) => !service.deactivatedAt,
  );
  const activeResources = (resourcesQuery.data?.items ?? []).filter(
    (resource) => !resource.deactivatedAt,
  );
  const resources =
    scope === "both"
      ? activeResources.filter((resource) =>
          assignmentsQuery.data?.items.some(
            (assignment) =>
              assignment.id === resource.id && !assignment.deactivatedAt,
          ),
        )
      : activeResources;

  useEffect(() => {
    if (!open) return;
    setScope("service");
    setServiceId("");
    setResourceId("");
    setCreated(null);
    setCopied(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (scope === "both" && !resources.some((item) => item.id === resourceId))
      setResourceId("");
  }, [resourceId, resources, scope]);

  const canCreate =
    !isReadOnly &&
    !createMutation.isPending &&
    ((scope === "service" && Boolean(serviceId)) ||
      (scope === "resource" && Boolean(resourceId)) ||
      (scope === "both" && Boolean(serviceId && resourceId)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    setError(null);
    try {
      const link = await createMutation.mutateAsync({
        ...(scope !== "resource" ? { serviceId } : {}),
        ...(scope !== "service" ? { resourceId } : {}),
      });
      setCreated(link);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "SERVICE_NOT_ASSIGNED")
        setError(
          "That scope no longer has an active Service and Resource assignment.",
        );
      else setError("We couldn't create this booking link. Please try again.");
    }
  }

  async function copyCreated() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(linkUrl(slug, created.token));
      setCopied(true);
    } catch {
      setError(
        "We couldn't copy the link. Select the URL and copy it manually.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={styles.shareDialog}
        aria-busy={createMutation.isPending}
      >
        <DialogTitle>
          {created ? "Booking link created" : "Create booking link"}
        </DialogTitle>
        <DialogDescription>
          {created
            ? "This link is ready to share with customers."
            : "Lock the public booking page to a Service, a Resource, or both."}
        </DialogDescription>
        {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
        {created ? (
          <div className={styles.createdShareLink}>
            <code>{linkUrl(slug, created.token)}</code>
            <div className={styles.dialogActions}>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button onClick={() => void copyCreated()}>
                <Copy aria-hidden="true" /> {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </div>
        ) : (
          <form className={styles.shareForm} onSubmit={submit}>
            <FormField htmlFor="share-scope" label="Scope">
              <Select
                value={scope}
                onValueChange={(value) => setScope(value as ScopeKind)}
              >
                <SelectTrigger id="share-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="resource">Resource</SelectItem>
                  <SelectItem value="both">Service + Resource</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {scope !== "resource" ? (
              <FormField htmlFor="share-service" label="Service">
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger id="share-service">
                    <SelectValue placeholder="Select a Service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ) : null}
            {scope !== "service" ? (
              <FormField htmlFor="share-resource" label="Resource">
                <Select
                  value={resourceId}
                  onValueChange={setResourceId}
                  disabled={scope === "both" && !serviceId}
                >
                  <SelectTrigger id="share-resource">
                    <SelectValue placeholder="Select a Resource" />
                  </SelectTrigger>
                  <SelectContent>
                    {resources.map((resource) => (
                      <SelectItem key={resource.id} value={resource.id}>
                        {resource.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ) : null}
            <div className={styles.dialogActions}>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canCreate}
                loading={createMutation.isPending}
              >
                Create link
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function BookingShareLinks({
  organizationId,
  slug,
  isOwner,
  isReadOnly,
}: {
  organizationId: string;
  slug: string;
  isOwner: boolean;
  isReadOnly: boolean;
}) {
  const linksQuery = useBookingShareLinks(organizationId, isOwner);
  const revokeMutation = useRevokeBookingShareLink(organizationId);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeLink, setRevokeLink] = useState<BookingShareLink | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const links = useMemo(
    () => linksQuery.data?.items ?? [],
    [linksQuery.data?.items],
  );

  if (!isOwner)
    return (
      <div className={styles.shareLinksSection}>
        <h3>Shareable booking links</h3>
        <p>Only an Organization Owner can manage scoped booking links.</p>
      </div>
    );

  async function copy(link: BookingShareLink) {
    try {
      await navigator.clipboard.writeText(linkUrl(slug, link.token));
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setError("We couldn't copy the link. Please try again.");
    }
  }

  async function revoke() {
    if (!revokeLink) return;
    setError(null);
    try {
      await revokeMutation.mutateAsync(revokeLink.id);
      setRevokeLink(null);
    } catch {
      setError("We couldn't revoke this booking link. Please try again.");
    }
  }

  return (
    <div className={styles.shareLinksSection}>
      <div className={styles.shareLinksHeading}>
        <div>
          <h3>Shareable booking links</h3>
          <p>
            Share the same booking page with a locked Service or Resource scope.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={isReadOnly}
        >
          <Plus aria-hidden="true" /> Create link
        </Button>
      </div>
      {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
      {linksQuery.isError ? (
        <InlineAlert variant="error">
          Booking links couldn't be loaded.
        </InlineAlert>
      ) : null}
      {!linksQuery.isPending && links.length === 0 ? (
        <div className={styles.emptyShareLinks}>
          <Link2 aria-hidden="true" />
          <span>No shareable links yet.</span>
        </div>
      ) : null}
      <div className={styles.shareLinkList}>
        {links.map((link) => {
          const summary = scopeSummary(link);
          const active = !link.revokedAt;
          return (
            <div className={styles.shareLinkRow} key={link.id}>
              <div className={styles.shareLinkCopy}>
                <strong>{summary.title}</strong>
                <span>
                  {summary.kind} · {active ? "Active" : "Revoked"}
                </span>
                <small>
                  Created {formatDate(link.createdAt)}
                  {link.revokedAt
                    ? ` · Revoked ${formatDate(link.revokedAt)}`
                    : ""}
                </small>
              </div>
              {active ? (
                <div className={styles.inlineActions}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copy(link)}
                  >
                    <Copy aria-hidden="true" />{" "}
                    {copiedId === link.id ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isReadOnly}
                    onClick={() => setRevokeLink(link)}
                  >
                    <Trash2 aria-hidden="true" /> Revoke
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <CreateShareLinkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
        slug={slug}
        isReadOnly={isReadOnly}
      />
      <Dialog
        open={Boolean(revokeLink)}
        onOpenChange={(open) => !open && setRevokeLink(null)}
      >
        <DialogContent
          className={styles.shareDialog}
          aria-busy={revokeMutation.isPending}
        >
          <DialogTitle>Revoke this booking link?</DialogTitle>
          <DialogDescription>
            Customers using this specific link will no longer be able to book
            through its saved scope. Your main booking page and existing
            bookings are unaffected.
          </DialogDescription>
          <div className={styles.dialogActions}>
            <Button
              variant="outline"
              onClick={() => setRevokeLink(null)}
              disabled={revokeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void revoke()}
              loading={revokeMutation.isPending}
            >
              Revoke link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
