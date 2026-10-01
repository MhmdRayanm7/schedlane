import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Organization } from "@/features/organizations/types";
import type {
  PublicationReadiness,
  PublicationReadinessCheck,
} from "@/features/publication/types";
import {
  useAvailabilitySettings,
  useUpdateAvailabilitySettings,
} from "@/features/schedule/hooks/use-availability-settings";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import {
  usePublicationReadiness,
  usePublicationStatus,
  useRequestPublication,
} from "../hooks/use-organization-settings";
import styles from "../settings.module.css";
import { BookingShareLinks } from "./booking-share-links";

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function checkLabel(check: PublicationReadinessCheck): string {
  switch (check.code) {
    case "organization_active":
      return check.ready
        ? "Organization is active"
        : "Restore the organization";
    case "platform_active":
      return check.ready
        ? "Platform access is active"
        : "Organization is suspended";
    case "active_service":
      return check.ready
        ? "Active service configured"
        : "Add an active Service";
    case "active_resource":
      return check.ready
        ? "Active resource configured"
        : "Add an active Resource";
    case "service_resources":
      return check.ready
        ? "Every active Service has an active Resource"
        : `${check.services?.map((service) => service.serviceName).join(", ")} ${check.services?.length === 1 ? "needs" : "need"} an assigned active Resource`;
    case "working_hours":
      return check.ready
        ? "Working hours configured"
        : "Configure working hours";
    case "service_prices":
      if (!check.applicable) return "Pricing is off";
      return check.ready
        ? "Every active Service has a price"
        : `${check.services?.map((service) => service.serviceName).join(", ")} ${check.services?.length === 1 ? "is" : "are"} missing a price`;
  }
}

function ReadinessChecklist({
  readiness,
}: {
  readiness: PublicationReadiness;
}) {
  return (
    <div className={styles.readiness}>
      <h3>Publication readiness</h3>
      <ul>
        {readiness.checks.map((check) => (
          <li data-ready={check.ready} key={check.code}>
            {check.ready ? (
              <Check aria-hidden="true" />
            ) : (
              <X aria-hidden="true" />
            )}
            <span>{checkLabel(check)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BookingPageSettingsSection({
  organization,
  onReview,
}: {
  organization: Organization;
  onReview: (
    section: "services" | "resources" | "schedule" | "pricing",
  ) => void;
}) {
  const readinessQuery = usePublicationReadiness(organization.id);
  const statusQuery = usePublicationStatus(organization.id);
  const availabilityQuery = useAvailabilitySettings(organization.id);
  const pauseMutation = useUpdateAvailabilitySettings(organization.id);
  const requestMutation = useRequestPublication(organization.id);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const path = `/book/${organization.slug}`;
  const publicUrl = useMemo(() => `${window.location.origin}${path}`, [path]);
  const status = statusQuery.data;
  const readiness = readinessQuery.data;
  const paused = availabilityQuery.data?.publicBookingPaused ?? false;
  const isOwner = organization.role === "owner";
  const isReadOnly = Boolean(
    organization.archivedAt || organization.suspendedAt,
  );
  const latest = status?.latestRequest;
  const pending = !status?.publishedAt && latest?.status === "pending";
  const failedCodes = new Set(
    readiness?.checks
      .filter((check) => !check.ready)
      .map((check) => check.code),
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setActionError(
        "We couldn't copy the link. Select the URL and copy it manually.",
      );
    }
  }

  async function requestPublication() {
    setActionError(null);
    try {
      await requestMutation.mutateAsync();
    } catch (error) {
      if (error instanceof ApiError && error.code === "PUBLICATION_NOT_READY")
        setActionError("The setup changed. Review the current blockers below.");
      else if (
        error instanceof ApiError &&
        error.code === "PUBLICATION_REQUEST_ALREADY_PENDING"
      )
        setActionError("A publication request is already pending.");
      else setActionError("We couldn't request publication. Please try again.");
    }
  }

  async function changePause(next: boolean) {
    setActionError(null);
    try {
      await pauseMutation.mutateAsync({ publicBookingPaused: next });
      await statusQuery.refetch();
    } catch {
      setActionError(
        "We couldn't update public booking status. Please try again.",
      );
    }
  }

  return (
    <section className={styles.section} aria-labelledby="settings-booking-page">
      <div className={styles.sectionIntro}>
        <h2 className={styles.sectionTitle} id="settings-booking-page">
          Booking page
        </h2>
        <p className={styles.sectionDescription}>
          Review publication readiness and control customer booking access.
        </p>
      </div>
      <div className={styles.sectionContent}>
        <div className={styles.statusRows}>
          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>Publication</span>
            <span className={styles.statusValue}>
              <span className={styles.publicationValue}>
                {statusQuery.isPending
                  ? "Loading…"
                  : status?.publishedAt
                    ? "Published"
                    : "Unpublished"}
              </span>
              <span className={styles.statusDescription}>
                {statusQuery.isPending
                  ? "Checking the current publication state."
                  : status?.publishedAt
                    ? "Platform review is approved."
                    : "This URL is not live for customers."}
              </span>
            </span>
          </div>
          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>Bookings</span>
            <span className={styles.statusValue}>
              <span className={styles.publicationValue}>
                {availabilityQuery.isPending
                  ? "Loading…"
                  : paused
                    ? "Paused"
                    : "Open"}
              </span>
              <span className={styles.statusDescription}>
                This operational control is independent from publication.
              </span>
            </span>
          </div>
        </div>

        <div className={styles.publicUrlBlock}>
          <code>{publicUrl}</code>
          <div className={styles.inlineActions}>
            <Button
              disabled={!status?.publishedAt}
              onClick={() => void copyLink()}
              size="sm"
              variant="outline"
            >
              <Copy aria-hidden="true" /> {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              disabled={!status?.publishedAt}
              onClick={() =>
                window.open(publicUrl, "_blank", "noopener,noreferrer")
              }
              size="sm"
              variant="outline"
            >
              <ExternalLink aria-hidden="true" /> Open booking page
            </Button>
          </div>
        </div>

        <label className={styles.toggleRow}>
          <span className={styles.toggleCopy}>
            <span className={styles.policyTitle}>Pause public booking</span>
            <span className={styles.policyDescription}>
              Existing bookings remain intact. Resume when you're ready to
              accept new bookings.
            </span>
          </span>
          <input
            aria-label="Pause public booking"
            checked={paused}
            className={styles.switch}
            disabled={
              isReadOnly ||
              availabilityQuery.isPending ||
              availabilityQuery.isError ||
              pauseMutation.isPending
            }
            onChange={(event) => void changePause(event.target.checked)}
            type="checkbox"
          />
        </label>

        <BookingShareLinks
          organizationId={organization.id}
          slug={organization.slug}
          isOwner={isOwner}
          isReadOnly={isReadOnly}
        />

        {statusQuery.isError ||
        readinessQuery.isError ||
        availabilityQuery.isError ? (
          <InlineAlert variant="error">
            Some booking page settings couldn't be loaded. Retry the page before
            making a publication decision.
          </InlineAlert>
        ) : null}

        {!status?.publishedAt && readiness ? (
          <ReadinessChecklist readiness={readiness} />
        ) : null}

        {!status?.publishedAt && !readiness?.ready ? (
          <div className={styles.inlineActions}>
            {failedCodes.has("active_service") ||
            failedCodes.has("service_resources") ||
            failedCodes.has("service_prices") ? (
              <Button
                onClick={() => onReview("services")}
                size="sm"
                variant="outline"
              >
                Review services
              </Button>
            ) : null}
            {failedCodes.has("active_resource") ||
            failedCodes.has("service_resources") ? (
              <Button
                onClick={() => onReview("resources")}
                size="sm"
                variant="outline"
              >
                Review resources
              </Button>
            ) : null}
            {failedCodes.has("working_hours") ? (
              <Button
                onClick={() => onReview("schedule")}
                size="sm"
                variant="outline"
              >
                Review schedule
              </Button>
            ) : null}
            {failedCodes.has("service_prices") ? (
              <Button
                onClick={() => onReview("pricing")}
                size="sm"
                variant="outline"
              >
                Review pricing
              </Button>
            ) : null}
          </div>
        ) : null}

        {pending ? (
          <div className={styles.publicationNotice}>
            <strong>Publication requested</strong>
            <span>Submitted {formatDateTime(latest.requestedAt)}.</span>
          </div>
        ) : null}
        {!status?.publishedAt && latest?.status === "rejected" ? (
          <InlineAlert variant="warning">
            <div className={styles.blockerContent}>
              <strong>Publication needs an update</strong>
              <span>{latest.rejectionReason}</span>
            </div>
          </InlineAlert>
        ) : null}
        {!status?.publishedAt && readiness?.ready && !pending ? (
          isOwner ? (
            <Button
              loading={requestMutation.isPending}
              loadingLabel="Requesting publication"
              onClick={() => void requestPublication()}
              size="sm"
            >
              {latest?.status === "rejected"
                ? "Request publication again"
                : "Request publication"}
            </Button>
          ) : (
            <div className={styles.publicationNotice}>
              <strong>Ready for publication</strong>
              <span>An Organization Owner must submit the request.</span>
            </div>
          )
        ) : null}
        {actionError ? (
          <InlineAlert variant="error">{actionError}</InlineAlert>
        ) : null}
      </div>
    </section>
  );
}
