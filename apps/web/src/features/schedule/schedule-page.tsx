import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import { DiscardChangesDialog } from "@/shared/components/discard-changes-dialog";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { BookingRulesTab } from "./components/booking-rules-tab";
import { OrganizationWeeklyHours } from "./components/organization-weekly-hours";
import { ResourceWeeklyHours } from "./components/resource-weekly-hours";
import { ScheduleExceptionsTab } from "./components/schedule-exceptions-tab";
import { ScheduleQueryError } from "./components/schedule-query-error";
import {
  useManageableScheduleResources,
  useOrganizationWeeklyHours,
  useResourceWeeklyHours,
  useUpdateOrganizationWeeklyHours,
  useUpdateResourceWeeklyHours,
} from "./hooks/use-weekly-hours";
import styles from "./schedule.module.css";

type ScheduleTab = "hours" | "exceptions" | "rules";

function HoursSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading schedule"
      className={styles.loading}
      role="status"
    >
      <div className={styles.loadingPanel}>
        <div className={`${styles.skeleton} ${styles.loadingTitle}`} />
        <div className={`${styles.skeleton} ${styles.loadingDescription}`} />
        <div className={styles.loadingRows}>
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className={styles.loadingRow}>
              <div className={`${styles.skeleton} ${styles.loadingLabel}`} />
              <div className={`${styles.skeleton} ${styles.loadingControl}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SchedulePage() {
  const { currentOrganization } = useOutletContext<OrganizationAccessContext>();
  const { organizationId = "" } = useParams<{ organizationId: string }>();

  const isReadOnly = Boolean(
    currentOrganization.archivedAt || currentOrganization.suspendedAt,
  );

  const [activeTab, setActiveTab] = useState<ScheduleTab>("hours");
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null,
  );
  const [organizationHoursDirty, setOrganizationHoursDirty] = useState(false);
  const [resourceHoursDirty, setResourceHoursDirty] = useState(false);
  const [exceptionsDirty, setExceptionsDirty] = useState(false);
  const [bookingRulesDirty, setBookingRulesDirty] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<{
    run: () => void;
  } | null>(null);

  const activeTabIsDirty =
    (activeTab === "hours" && (organizationHoursDirty || resourceHoursDirty)) ||
    (activeTab === "exceptions" && exceptionsDirty) ||
    (activeTab === "rules" && bookingRulesDirty);

  const runOrConfirm = (dirty: boolean, run: () => void) => {
    if (dirty) setPendingTransition({ run });
    else run();
  };

  const selectTab = (nextTab: ScheduleTab) => {
    if (nextTab === activeTab) return;
    runOrConfirm(activeTabIsDirty, () => {
      if (activeTab === "hours") {
        setOrganizationHoursDirty(false);
        setResourceHoursDirty(false);
      } else if (activeTab === "exceptions") {
        setExceptionsDirty(false);
      } else {
        setBookingRulesDirty(false);
      }
      setActiveTab(nextTab);
      requestAnimationFrame(() =>
        document.getElementById(`tab-${nextTab}`)?.focus(),
      );
    });
  };

  const selectResource = (resourceId: string) => {
    runOrConfirm(activeTab === "hours" && resourceHoursDirty, () => {
      setResourceHoursDirty(false);
      setSelectedResourceId(resourceId);
    });
  };

  // Queries & mutations for hours
  const orgHoursQuery = useOrganizationWeeklyHours(organizationId);
  const updateOrgHoursMutation =
    useUpdateOrganizationWeeklyHours(organizationId);

  const manageableResourcesQuery =
    useManageableScheduleResources(organizationId);
  const resources = manageableResourcesQuery.data?.items ?? [];

  // Automatically select the first active resource if none selected
  useEffect(() => {
    if (resources.length > 0 && !selectedResourceId) {
      const firstActive = resources.find((r) => !r.deactivatedAt);
      setSelectedResourceId(firstActive ? firstActive.id : resources[0].id);
    }
  }, [resources, selectedResourceId]);

  const resourceHoursQuery = useResourceWeeklyHours(
    organizationId,
    selectedResourceId ?? "",
    Boolean(selectedResourceId),
  );
  const updateResourceHoursMutation = useUpdateResourceWeeklyHours(
    organizationId,
    selectedResourceId ?? "",
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Schedule"
        description="Configure working hours, availability, and time away."
      />

      <div
        role="tablist"
        aria-label="Schedule sections"
        className={styles.tabs}
      >
        {(
          [
            ["hours", "Hours"],
            ["exceptions", "Exceptions"],
            ["rules", "Booking rules"],
          ] as const
        ).map(([tab, label], index, tabs) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`tab-${tab}`}
            aria-controls={`panel-${tab}`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => selectTab(tab)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft")
                next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              const nextTab = tabs[next][0];
              selectTab(nextTab);
            }}
            className={styles.tab}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "hours" && (
        <div
          id="panel-hours"
          role="tabpanel"
          aria-labelledby="tab-hours"
          className={styles.tabPanel}
        >
          {orgHoursQuery.isLoading ? (
            <HoursSkeleton />
          ) : orgHoursQuery.isError ? (
            <div className={styles.errorState}>
              <h2 className={styles.errorTitle}>
                Unable to load business hours
              </h2>
              <p className={styles.errorDescription}>
                We encountered an error loading your organization's business
                hours.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => orgHoursQuery.refetch()}
                className={styles.retry}
              >
                <RefreshCw aria-hidden="true" className={styles.smallIcon} />
                Try again
              </Button>
            </div>
          ) : orgHoursQuery.data ? (
            <>
              <OrganizationWeeklyHours
                data={orgHoursQuery.data}
                isReadOnly={isReadOnly}
                onSave={async (days) => {
                  await updateOrgHoursMutation.mutateAsync(days);
                }}
                isSaving={updateOrgHoursMutation.isPending}
                onDirtyChange={setOrganizationHoursDirty}
              />

              {manageableResourcesQuery.isError ? (
                <ScheduleQueryError
                  message="Could not load schedule resources."
                  onRetry={() => void manageableResourcesQuery.refetch()}
                />
              ) : null}
              {resourceHoursQuery.isError ? (
                <ScheduleQueryError
                  message="Could not load this resource's hours."
                  onRetry={() => void resourceHoursQuery.refetch()}
                />
              ) : null}
              <ResourceWeeklyHours
                key={selectedResourceId}
                resources={resources}
                selectedResourceId={selectedResourceId}
                onSelectResource={selectResource}
                resourceHoursData={resourceHoursQuery.data}
                orgHoursData={orgHoursQuery.data}
                isLoadingResourceHours={
                  Boolean(selectedResourceId) && resourceHoursQuery.isLoading
                }
                isReadOnly={isReadOnly || !resourceHoursQuery.data}
                onSave={async (days) => {
                  await updateResourceHoursMutation.mutateAsync(days);
                }}
                isSaving={updateResourceHoursMutation.isPending}
                onDirtyChange={setResourceHoursDirty}
              />
            </>
          ) : null}
        </div>
      )}

      {activeTab === "exceptions" && (
        <div
          id="panel-exceptions"
          role="tabpanel"
          aria-labelledby="tab-exceptions"
        >
          <ScheduleExceptionsTab
            organizationId={organizationId}
            resources={resources}
            selectedResourceId={selectedResourceId}
            onSelectResource={selectResource}
            orgWeeklyHours={orgHoursQuery.data}
            isReadOnly={isReadOnly}
            onDirtyChange={setExceptionsDirty}
          />
        </div>
      )}

      {activeTab === "rules" && (
        <div id="panel-rules" role="tabpanel" aria-labelledby="tab-rules">
          <BookingRulesTab
            organizationId={organizationId}
            isReadOnly={isReadOnly}
            onDirtyChange={setBookingRulesDirty}
          />
        </div>
      )}

      <DiscardChangesDialog
        open={pendingTransition !== null}
        onCancel={() => setPendingTransition(null)}
        onDiscard={() => {
          const transition = pendingTransition;
          setPendingTransition(null);
          transition?.run();
        }}
      />
    </div>
  );
}
