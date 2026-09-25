import { AlertCircle } from "lucide-react";
import { useState } from "react";
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

type ScheduleExceptionsTabProps = {
  organizationId: string;
  resources: ManageableResource[];
  selectedResourceId: string | null;
  onSelectResource: (resourceId: string) => void;
  orgWeeklyHours: WeeklyHoursResponse | undefined;
  isReadOnly?: boolean;
};

export function ScheduleExceptionsTab({
  organizationId,
  resources,
  selectedResourceId,
  onSelectResource,
  orgWeeklyHours,
  isReadOnly = false,
}: ScheduleExceptionsTabProps) {
  const [selectedDate, setSelectedDate] = useState(() =>
    getJerusalemTodayDate(),
  );
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);

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
    <div className="space-y-6">
      {/* Date Picker Section */}
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <label
              htmlFor="exception-date-input"
              className="text-sm font-semibold text-foreground"
            >
              Selected calendar date
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Manage overrides and time away for a specific Jerusalem calendar
              date.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-foreground">
              {formatDateDisplay(selectedDate)}
            </span>
            <Input
              id="exception-date-input"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                }
              }}
              className="h-9 w-40 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Organization Date Override */}
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
      />

      {/* Resource Section Header / Selector */}
      {resources.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <h3 className="text-sm font-semibold text-foreground">
            No resources available for scheduling
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Create or link a resource before configuring individual
            availability.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Resource schedule exceptions
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Select a team resource to customize their schedule or log
                blocked time.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label htmlFor="exceptions-resource-select" className="sr-only">
                Select Resource
              </label>
              <div className="w-56">
                <Select
                  value={selectedResourceId ?? ""}
                  onValueChange={onSelectResource}
                >
                  <SelectTrigger
                    id="exceptions-resource-select"
                    className="h-9 text-xs"
                  >
                    <SelectValue placeholder="Select resource" />
                  </SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-xs">
                        {r.name} {r.deactivatedAt ? "(Inactive)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isResourceInactive && (
                <span
                  className="inline-flex items-center gap-1 rounded bg-surface-subtle px-2 py-1 text-xs font-medium text-muted-foreground border border-border"
                  role="status"
                >
                  <AlertCircle
                    aria-hidden="true"
                    className="size-3 text-warning"
                  />
                  Inactive
                </span>
              )}
            </div>
          </div>

          {selectedResourceId && (
            <>
              {/* Resource Date Override */}
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
              />

              {/* Resource Time Blocks */}
              <ResourceTimeBlocks
                date={selectedDate}
                resource={selectedResource}
                timeBlocks={timeBlocksQuery.data?.items ?? []}
                isLoading={timeBlocksQuery.isLoading}
                isReadOnly={isReadOnly}
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
    </div>
  );
}
