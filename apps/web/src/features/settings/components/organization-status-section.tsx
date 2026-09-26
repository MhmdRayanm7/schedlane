import type { Organization } from "@/features/organizations/types";
import { Button } from "@/shared/components/ui/button";
import styles from "../settings.module.css";

function lifecycle(organization: Organization) {
  if (organization.suspendedAt) {
    return {
      label: "Suspended",
      tone: "warning",
      description:
        "This organization is read-only while suspended by the platform.",
    };
  }
  if (organization.archivedAt) {
    return {
      label: "Archived",
      tone: "neutral",
      description:
        "This organization is read-only. Its data remains preserved.",
    };
  }
  return {
    label: "Active",
    tone: "active",
    description: "This organization is available for normal management.",
  };
}

export function OrganizationStatusSection({
  onLifecycleAction,
  organization,
}: {
  onLifecycleAction: (action: "archive" | "restore") => void;
  organization: Organization;
}) {
  const state = lifecycle(organization);
  return (
    <>
      <section className={styles.section} aria-labelledby="settings-status">
        <div className={styles.sectionIntro}>
          <h2 className={styles.sectionTitle} id="settings-status">
            Organization status
          </h2>
          <p className={styles.sectionDescription}>
            Review lifecycle and publication state.
          </p>
        </div>
        <div className={styles.sectionContent}>
          <div className={styles.statusRows}>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Lifecycle</span>
              <span className={styles.statusValue}>
                <span className={styles.statusBadge} data-tone={state.tone}>
                  <span aria-hidden="true" className={styles.statusDot} />
                  {state.label}
                </span>
                <span className={styles.statusDescription}>
                  {state.description}
                </span>
              </span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Publication</span>
              <span className={styles.statusValue}>
                <span className={styles.publicationValue}>
                  {organization.publishedAt ? "Published" : "Unpublished"}
                </span>
                <span className={styles.statusDescription}>
                  {organization.publishedAt
                    ? "The organization has a publication record. Booking availability is managed separately."
                    : "The organization is not currently published."}
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {organization.role === "owner" && !organization.suspendedAt ? (
        <section
          className={`${styles.section} ${styles.dangerSection}`}
          aria-labelledby="settings-danger"
        >
          <div className={styles.sectionIntro}>
            <h2 className={styles.sectionTitle} id="settings-danger">
              Danger zone
            </h2>
            <p className={styles.sectionDescription}>
              Lifecycle actions that affect access to this workspace.
            </p>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.dangerAction}>
              <div>
                <h3 className={styles.actionTitle}>
                  {organization.archivedAt
                    ? "Restore organization"
                    : "Archive organization"}
                </h3>
                <p className={styles.actionDescription}>
                  {organization.archivedAt
                    ? "Make the organization editable again. Publication remains off."
                    : "Make the organization read-only and remove public publication. Data is preserved."}
                </p>
              </div>
              <Button
                onClick={() =>
                  onLifecycleAction(
                    organization.archivedAt ? "restore" : "archive",
                  )
                }
                size="sm"
                variant={
                  organization.archivedAt ? "outline" : "destructiveOutline"
                }
              >
                {organization.archivedAt
                  ? "Restore organization"
                  : "Archive organization"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
