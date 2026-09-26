import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useOutletContext, useParams } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { useUnsavedChangesGuard } from "@/shared/unsaved-changes/unsaved-changes";
import { GeneralSettingsSection } from "./components/general-settings-section";
import { OrganizationLifecycleDialog } from "./components/organization-lifecycle-dialog";
import { OrganizationStatusSection } from "./components/organization-status-section";
import { TeamAccessSettingsSection } from "./components/team-access-settings-section";
import { useOrganizationSettings } from "./hooks/use-organization-settings";
import styles from "./settings.module.css";

function TeamAccessSkeleton() {
  return (
    <section
      className={styles.section}
      aria-label="Loading team access settings"
      aria-busy="true"
    >
      <div className={styles.sectionIntro}>
        <div className={`${styles.skeleton} ${styles.skeletonHeading}`} />
        <div className={`${styles.skeleton} ${styles.skeletonDescription}`} />
      </div>
      <div className={styles.sectionContent}>
        <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
        <div className={`${styles.skeleton} ${styles.skeletonOption}`} />
        <div className={`${styles.skeleton} ${styles.skeletonOption}`} />
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { currentOrganization } = useOutletContext<OrganizationAccessContext>();
  const { organizationId = "" } = useParams<{ organizationId: string }>();
  const settingsQuery = useOrganizationSettings(organizationId);
  const { requestChange } = useUnsavedChangesGuard();
  const [lifecycleAction, setLifecycleAction] = useState<
    "archive" | "restore" | null
  >(null);

  function requestLifecycleAction(action: "archive" | "restore") {
    requestChange(() => setLifecycleAction(action), {
      ids: [
        `settings:general:${organizationId}`,
        `settings:team-access:${organizationId}`,
      ],
    });
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Settings"
        description="Manage your organization, access policy, and lifecycle."
      />
      <div className={styles.sections}>
        <GeneralSettingsSection organization={currentOrganization} />

        {settingsQuery.isPending ? <TeamAccessSkeleton /> : null}
        {settingsQuery.isError ? (
          <section
            className={styles.section}
            aria-labelledby="settings-team-access-error"
          >
            <div className={styles.sectionIntro}>
              <h2
                className={styles.sectionTitle}
                id="settings-team-access-error"
              >
                Team access
              </h2>
              <p className={styles.sectionDescription}>
                Choose how much of the team staff members can see.
              </p>
            </div>
            <div className={styles.sectionContent}>
              <div className={styles.sectionError} role="alert">
                <div>
                  <p className={styles.errorTitle}>
                    Unable to load team access
                  </p>
                  <p className={styles.errorDescription}>
                    Your organization identity is still available. Retry this
                    section when ready.
                  </p>
                </div>
                <Button
                  onClick={() => void settingsQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  <RefreshCw aria-hidden="true" className={styles.icon} />
                  Try again
                </Button>
              </div>
            </div>
          </section>
        ) : null}
        {settingsQuery.data ? (
          <TeamAccessSettingsSection
            organization={currentOrganization}
            persistedVisibility={settingsQuery.data.staffTeamVisibility}
          />
        ) : null}

        <OrganizationStatusSection
          onLifecycleAction={requestLifecycleAction}
          organization={currentOrganization}
        />
      </div>
      <OrganizationLifecycleDialog
        action={lifecycleAction}
        onOpenChange={(open) => {
          if (!open) setLifecycleAction(null);
        }}
        organization={currentOrganization}
      />
    </div>
  );
}
