import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { DiscardChangesDialog } from "@/shared/components/discard-changes-dialog";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  useCreateResourceTimeBlock,
  useDeleteResourceTimeBlock,
  useOrganizationDateOverride,
  useResourceDateOverride,
  useResourceTimeBlocks,
  useUpdateOrganizationDateOverride,
  useUpdateResourceDateOverride,
} from "../hooks/use-schedule-exceptions";
import { useResourceWeeklyHours } from "../hooks/use-weekly-hours";
import {
  formatDateDisplay,
  getIsoWeekdayForDate,
  getJerusalemTodayDate,
} from "../lib/dates";
import type { ManageableResource, WeeklyHoursResponse } from "../types";
import { OrganizationDateOverride } from "./organization-date-override";
import { ResourceDateOverride } from "./resource-date-override";
import { ResourceTimeBlocks } from "./resource-time-blocks";
import styles from "./schedule-exceptions.module.css";
import { ScheduleQueryError } from "./schedule-query-error";

type ScheduleExceptionsTabProps = {
  organizationId: string;
  resources: ManageableResource[];
  selectedResourceId: string | null;
  onSelectResource: (resourceId: string) => void;
  orgWeeklyHours: WeeklyHoursResponse | undefined;
  isReadOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

export function ScheduleExceptionsTab({
  organizationId,
  resources,
  selectedResourceId,
  onSelectResource,
  orgWeeklyHours,
  isReadOnly = false,
  onDirtyChange,
}: ScheduleExceptionsTabProps) {
  const [selectedDate, setSelectedDate] = useState(() =>
    getJerusalemTodayDate(),
  );
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [orgOverrideDirty, setOrgOverrideDirty] = useState(false);
  const [resourceOverrideDirty, setResourceOverrideDirty] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<
    { type: "date"; value: string } | { type: "resource"; value: string } | null
  >(null);

  useEffect(() => {
    onDirtyChange?.(orgOverrideDirty || resourceOverrideDirty);
  }, [onDirtyChange, orgOverrideDirty, resourceOverrideDirty]);

  const handleDateChange = (nextDate: string) => {
    if (orgOverrideDirty || resourceOverrideDirty) {
      setPendingTransition({ type: "date", value: nextDate });
      return;
    }
    setSelectedDate(nextDate);
  };

  const handleResourceChange = (resourceId: string) => {
    if (resourceOverrideDirty) {
      setPendingTransition({ type: "resource", value: resourceId });
    } else {
      onSelectResource(resourceId);
    }
  };

  const discardAndContinue = () => {
    const transition = pendingTransition;
    setPendingTransition(null);
    if (!transition) return;
    if (transition.type === "date") {
      setOrgOverrideDirty(false);
      setResourceOverrideDirty(false);
      setSelectedDate(transition.value);
    } else {
      setResourceOverrideDirty(false);
      onSelectResource(transition.value);
    }
  };

  const selectedWeekday = getIsoWeekdayForDate(selectedDate);
  const selectedResource = resources.find((r) => r.id === selectedResourceId);
  const isResourceInactive = Boolean(selectedResource?.deactivatedAt);

  // Organization override query & mutation
  const orgOverrideQuery = useOrganizationDateOverride(
    organizationId,
    selectedDate,
  );
  const updateOrgOverrideMutation = useUpdateOrganizationDateOverride(
    organizationId,
    selectedDate,
  );

  // Resource override query & mutation
  const resourceOverrideQuery = useResourceDateOverride(
    organizationId,
    selectedResourceId ?? "",
    selectedDate,
    Boolean(selectedResourceId),
  );
  const updateResourceOverrideMutation = useUpdateResourceDateOverride(
    organizationId,
    selectedResourceId ?? "",
    selectedDate,
  );

  // Resource weekly hours (to derive normal schedule preview)
  const resourceWeeklyHoursQuery = useResourceWeeklyHours(
    organizationId,
    selectedResourceId ?? "",
    Boolean(selectedResourceId),
  );

  // Resource time blocks query & mutations
  const timeBlocksQuery = useResourceTimeBlocks(
    organizationId,
    selectedResourceId ?? "",
    selectedDate,
    Boolean(selectedResourceId),
  );
  const createTimeBlockMutation = useCreateResourceTimeBlock(
    organizationId,
    selectedResourceId ?? "",
    selectedDate,
  );
  const deleteTimeBlockMutation = useDeleteResourceTimeBlock(
    organizationId,
    selectedResourceId ?? "",
    selectedDate,
  );

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <div>
            <label htmlFor="exception-date-input" className={styles.title}>
              Selected calendar date
            </label>
            <p className={styles.description}>
              Manage overrides and time away for a specific Jerusalem calendar
              date.
            </p>
          </div>

          <div className={styles.dateControls}>
            <span className={styles.controlLabel}>
              {formatDateDisplay(selectedDate)}
            </span>
            <Input
              id="exception-date-input"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  handleDateChange(e.target.value);
                }
              }}
              className={styles.dateInput}
            />
          </div>
        </div>
      </div>

      {orgOverrideQuery.isError ? (
        <ScheduleQueryError
          message="Could not load the organization exception."
          onRetry={() => void orgOverrideQuery.refetch()}
        />
      ) : null}
      {orgOverrideQuery.data ? (
        <OrganizationDateOverride
          key={selectedDate}
          date={selectedDate}
          weekday={selectedWeekday}
          override={orgOverrideQuery.data}
          orgWeeklyHours={orgWeeklyHours}
          isReadOnly={isReadOnly}
          onSave={async (data) => {
            await updateOrgOverrideMutation.mutateAsync(data);
          }}
          isSaving={updateOrgOverrideMutation.isPending}
          onDirtyChange={setOrgOverrideDirty}
        />
      ) : orgOverrideQuery.isPending ? (
        <p role="status" className={styles.loadingMessage}>
          Loading organization exception...
        </p>
      ) : null}

      {resources.length === 0 ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>
            No resources available for scheduling
          </h3>
          <p className={styles.emptyDescription}>
            Create or link a resource before configuring individual
            availability.
          </p>
        </div>
      ) : (
        <div className={styles.resourceArea}>
          <div className={styles.resourceHeader}>
            <div>
              <h3 className={styles.title}>Resource schedule exceptions</h3>
              <p className={styles.description}>
                Select a resource to manage exceptions and blocked time.
              </p>
            </div>

            <div className={styles.resourceControls}>
              <label
                htmlFor="exceptions-resource-select"
                className={styles.visuallyHidden}
              >
                Select Resource
              </label>
              <div className={styles.selectWrapper}>
                <Select
                  value={selectedResourceId ?? ""}
                  onValueChange={handleResourceChange}
                >
                  <SelectTrigger
                    id="exceptions-resource-select"
                    className={styles.compactSelect}
                  >
                    <SelectValue placeholder="Select resource" />
                  </SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem
                        key={r.id}
                        value={r.id}
                        className={styles.compactItem}
                      >
                        {r.name} {r.deactivatedAt ? "(Inactive)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isResourceInactive && (
                <span className={styles.inactiveNotice} role="status">
                  <AlertCircle
                    aria-hidden="true"
                    className={styles.warningIcon}
                  />
                  Inactive
                </span>
              )}
            </div>
          </div>

          {selectedResourceId && (
            <>
              {resourceOverrideQuery.isError ? (
                <ScheduleQueryError
                  message="Could not load the resource exception."
                  onRetry={() => void resourceOverrideQuery.refetch()}
                />
              ) : null}
              {resourceOverrideQuery.data ? (
                <ResourceDateOverride
                  key={`${selectedResourceId}-${selectedDate}`}
                  date={selectedDate}
                  weekday={selectedWeekday}
                  resource={selectedResource}
                  override={resourceOverrideQuery.data}
                  resourceWeeklyHours={resourceWeeklyHoursQuery.data}
                  orgWeeklyHours={orgWeeklyHours}
                  isReadOnly={isReadOnly}
                  onSave={async (data) => {
                    await updateResourceOverrideMutation.mutateAsync(data);
                  }}
                  isSaving={updateResourceOverrideMutation.isPending}
                  onDirtyChange={setResourceOverrideDirty}
                />
              ) : resourceOverrideQuery.isPending ? (
                <p role="status" className={styles.loadingMessage}>
                  Loading resource exception...
                </p>
              ) : null}

              {timeBlocksQuery.isError ? (
                <ScheduleQueryError
                  message="Could not load blocked time."
                  onRetry={() => void timeBlocksQuery.refetch()}
                />
              ) : null}
              <ResourceTimeBlocks
                date={selectedDate}
                resource={selectedResource}
                timeBlocks={timeBlocksQuery.data?.items ?? []}
                isLoading={timeBlocksQuery.isLoading}
                isReadOnly={isReadOnly || !timeBlocksQuery.data}
                onCreateBlock={async (interval) => {
                  await createTimeBlockMutation.mutateAsync(interval);
                }}
                onDeleteBlock={async (timeBlockId) => {
                  setDeletingBlockId(timeBlockId);
                  try {
                    await deleteTimeBlockMutation.mutateAsync(timeBlockId);
                  } finally {
                    setDeletingBlockId(null);
                  }
                }}
                isCreating={createTimeBlockMutation.isPending}
                deletingBlockId={deletingBlockId}
              />
            </>
          )}
        </div>
      )}

      <DiscardChangesDialog
        open={pendingTransition !== null}
        onCancel={() => setPendingTransition(null)}
        onDiscard={discardAndContinue}
      />
    </div>
  );
}
