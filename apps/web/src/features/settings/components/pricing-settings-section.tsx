import { useState } from "react";
import type { Organization } from "@/features/organizations/types";
import type { PublicationServiceBlocker } from "@/features/publication/types";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { useUpdateOrganizationPricing } from "../hooks/use-organization-settings";
import styles from "../settings.module.css";

function pricingBlockers(error: unknown): PublicationServiceBlocker[] {
  if (
    !(error instanceof ApiError) ||
    error.code !== "ACTIVE_SERVICES_MISSING_PRICE"
  )
    return [];
  const services = error.details.services;
  if (!Array.isArray(services)) return [];
  return services.filter(
    (service): service is PublicationServiceBlocker =>
      Boolean(service) &&
      typeof service === "object" &&
      typeof (service as PublicationServiceBlocker).serviceId === "string" &&
      typeof (service as PublicationServiceBlocker).serviceName === "string",
  );
}

export function PricingSettingsSection({
  organization,
  pricingEnabled,
  onReviewServices,
}: {
  organization: Organization;
  pricingEnabled: boolean;
  onReviewServices: () => void;
}) {
  const mutation = useUpdateOrganizationPricing(organization.id);
  const [blockers, setBlockers] = useState<PublicationServiceBlocker[]>([]);
  const isOwner = organization.role === "owner";
  const isReadOnly = Boolean(
    organization.archivedAt || organization.suspendedAt,
  );

  async function change(next: boolean) {
    setBlockers([]);
    try {
      await mutation.mutateAsync(next);
    } catch (error) {
      setBlockers(pricingBlockers(error));
    }
  }

  return (
    <section className={styles.section} aria-labelledby="settings-pricing">
      <div className={styles.sectionIntro}>
        <h2 className={styles.sectionTitle} id="settings-pricing">
          Pricing
        </h2>
        <p className={styles.sectionDescription}>
          Control whether saved Service prices appear during public booking.
        </p>
      </div>
      <div className={styles.sectionContent}>
        <label className={styles.toggleRow}>
          <span className={styles.toggleCopy}>
            <span className={styles.policyTitle}>
              {pricingEnabled ? "Pricing on" : "Pricing off"}
            </span>
            <span className={styles.policyDescription}>
              {pricingEnabled
                ? "Prices are shown during public booking."
                : "Prices are hidden from customers, but saved Service prices are kept."}
            </span>
          </span>
          <input
            aria-label="Show prices during public booking"
            checked={pricingEnabled}
            className={styles.switch}
            disabled={!isOwner || isReadOnly || mutation.isPending}
            onChange={(event) => void change(event.target.checked)}
            type="checkbox"
          />
        </label>
        {!isOwner ? (
          <p className={styles.ownerHint}>
            Only an Organization Owner can change pricing mode.
          </p>
        ) : null}
        {blockers.length > 0 ? (
          <InlineAlert className={styles.blockerAlert} variant="warning">
            <div className={styles.blockerContent}>
              <strong>Pricing can't be enabled yet.</strong>
              <span>
                {blockers.length} active{" "}
                {blockers.length === 1 ? "service is" : "services are"} missing
                a price.
              </span>
              <ul>
                {blockers.map((service) => (
                  <li key={service.serviceId}>{service.serviceName}</li>
                ))}
              </ul>
              <Button onClick={onReviewServices} size="sm" variant="outline">
                Review services
              </Button>
            </div>
          </InlineAlert>
        ) : null}
        {mutation.isError && blockers.length === 0 ? (
          <InlineAlert variant="error">
            We couldn't update pricing. Please try again.
          </InlineAlert>
        ) : null}
      </div>
    </section>
  );
}
