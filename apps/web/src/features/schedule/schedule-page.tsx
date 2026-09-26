import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
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

type ScheduleTab = "hours" | "exceptions" | "rules";

function HoursSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading schedule"
      className="space-y-6"
      role="status"
    >
      <div className="border-t border-border p-6">
        <div className="h-5 w-48 rounded bg-border animate-pulse" />
        <div className="mt-2 h-4 w-60 max-w-full rounded bg-border/60 animate-pulse" />
        <div className="mt-6 divide-y divide-border">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="h-4 w-24 rounded bg-border animate-pulse" />
              <div className="h-8 w-48 rounded bg-border animate-pulse" />
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
    <div className="max-w-[1040px] space-y-5">
      <PageHeader
        title="Schedule"
        description="Configure working hours, availability, and time away."
      />

      <div
        role="tablist"
        aria-label="Schedule sections"
        className="flex border-b border-border"
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
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft")
                next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              setActiveTab(tabs[next][0]);
              document.getElementById(`tab-${tabs[next][0]}`)?.focus();
            }}
            className={`min-h-10 border-b-2 px-3 py-2 text-sm transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-offset-[-2px] sm:px-4 ${activeTab === tab ? "border-primary font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground"}`}
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
          className="space-y-6"
        >
          {orgHoursQuery.isLoading ? (
            <HoursSkeleton />
          ) : orgHoursQuery.isError ? (
            <div className="border-t border-border p-8 text-center">
              <h2 className="text-base font-semibold text-foreground">
                Unable to load business hours
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We encountered an error loading your organization's business
                hours.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => orgHoursQuery.refetch()}
                className="mt-4"
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
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
                resources={resources}
                selectedResourceId={selectedResourceId}
                onSelectResource={setSelectedResourceId}
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
            onSelectResource={setSelectedResourceId}
            orgWeeklyHours={orgHoursQuery.data}
            isReadOnly={isReadOnly}
          />
        </div>
      )}

      {activeTab === "rules" && (
        <div id="panel-rules" role="tabpanel" aria-labelledby="tab-rules">
          <BookingRulesTab
            organizationId={organizationId}
            isReadOnly={isReadOnly}
          />
        </div>
      )}
    </div>
  );
}
