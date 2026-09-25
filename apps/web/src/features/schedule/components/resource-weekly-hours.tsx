import { AlertCircle, Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { WEEKDAYS_SUNDAY_FIRST } from "../lib/constants";
import {
  areIntervalsEqual,
  formatIntervalsSummary,
  minuteToTime,
  timeToMinute,
  validateIntervals,
} from "../lib/time";
import type {
  AvailabilityMode,
  ManageableResource,
  MinuteInterval,
  ResourceWeekdayHours,
  ResourceWeeklyHoursResponse,
  WeeklyHoursResponse,
} from "../types";
import { type IntervalDraft, TimeIntervalInput } from "./time-interval-input";

type ResourceWeeklyHoursProps = {
  resources: ManageableResource[];
  selectedResourceId: string | null;
  onSelectResource: (resourceId: string) => void;
  resourceHoursData: ResourceWeeklyHoursResponse | undefined;
  orgHoursData: WeeklyHoursResponse | undefined;
  isLoadingResourceHours: boolean;
  isReadOnly?: boolean;
  onSave: (days: ResourceWeekdayHours[]) => Promise<unknown>;
  isSaving: boolean;
};

type DayDraft = {
  mode: AvailabilityMode;
  intervals: IntervalDraft[];
};

function initDraft(
  resourceData: ResourceWeeklyHoursResponse | undefined,
): Record<number, DayDraft> {
  const map: Record<number, DayDraft> = {};
  for (let weekday = 1; weekday <= 7; weekday++) {
    const day = resourceData?.days.find((d) => d.weekday === weekday);
    const mode = day?.mode ?? "inherit";
    const intervals = day?.intervals ?? [];
    map[weekday] = {
      mode,
      intervals: intervals.map((iv) => ({
        id: crypto.randomUUID(),
        startStr: minuteToTime(iv.startMinute),
        endStr: minuteToTime(iv.endMinute),
      })),
    };
  }
  return map;
}

function parseDraftsForWeekday(drafts: IntervalDraft[]): {
  intervals: MinuteInterval[];
  error: string | null;
} {
  const intervals: MinuteInterval[] = [];
  for (const draft of drafts) {
    const startMinute = timeToMinute(draft.startStr);
    const endMinute = timeToMinute(draft.endStr);
    if (startMinute === null) {
      return {
        intervals: [],
        error: `Invalid time "${draft.startStr}". Use HH:mm format (e.g. 09:00).`,
      };
    }
    if (endMinute === null) {
      return {
        intervals: [],
        error: `Invalid time "${draft.endStr}". Use HH:mm format (e.g. 17:00, 24:00).`,
      };
    }
    intervals.push({ startMinute, endMinute });
  }
  const error = validateIntervals(intervals);
  return { intervals, error };
}

export function ResourceWeeklyHours({
  resources,
  selectedResourceId,
  onSelectResource,
  resourceHoursData,
  orgHoursData,
  isLoadingResourceHours,
  isReadOnly = false,
  onSave,
  isSaving,
}: ResourceWeeklyHoursProps) {
  const selectedResource = resources.find((r) => r.id === selectedResourceId);
  const isResourceInactive = Boolean(selectedResource?.deactivatedAt);

  const [draft, setDraft] = useState<Record<number, DayDraft>>(() =>
    initDraft(resourceHoursData),
  );
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync draft when server data changes
  useEffect(() => {
    setDraft(initDraft(resourceHoursData));
  }, [resourceHoursData]);

  // Map organization hours by weekday for inherited preview and prefilling
  const orgHoursByWeekday: Record<number, MinuteInterval[]> = {};
  if (orgHoursData) {
    for (const d of orgHoursData.days) {
      orgHoursByWeekday[d.weekday] = d.intervals;
    }
  }

  // Parse custom drafts and check for errors
  const parsedByWeekday: Record<
    number,
    { intervals: MinuteInterval[]; error: string | null }
  > = {};
  let hasAnyError = false;

  for (let weekday = 1; weekday <= 7; weekday++) {
    const dayDraft = draft[weekday] ?? { mode: "inherit", intervals: [] };
    if (dayDraft.mode === "custom") {
      if (dayDraft.intervals.length === 0) {
        parsedByWeekday[weekday] = {
          intervals: [],
          error: "At least one interval is required for custom hours.",
        };
        hasAnyError = true;
      } else {
        const parsed = parseDraftsForWeekday(dayDraft.intervals);
        parsedByWeekday[weekday] = parsed;
        if (parsed.error) {
          hasAnyError = true;
        }
      }
    } else {
      parsedByWeekday[weekday] = { intervals: [], error: null };
    }
  }

  // Check dirty state
  const isDirty = WEEKDAYS_SUNDAY_FIRST.some(({ weekday }) => {
    const serverDay = resourceHoursData?.days.find(
      (d) => d.weekday === weekday,
    );
    const serverMode = serverDay?.mode ?? "inherit";
    const serverIntervals = serverDay?.intervals ?? [];
    const clientDay = draft[weekday] ?? { mode: "inherit", intervals: [] };

    if (serverMode !== clientDay.mode) return true;
    if (clientDay.mode === "custom") {
      return !areIntervalsEqual(
        serverIntervals,
        parsedByWeekday[weekday].intervals,
      );
    }
    return false;
  });

  const handleModeChange = (weekday: number, newMode: AvailabilityMode) => {
    setSaveSuccess(false);
    setSaveError(null);
    setDraft((prev) => {
      const currentDay = prev[weekday] ?? { mode: "inherit", intervals: [] };
      let updatedIntervals = currentDay.intervals;

      if (newMode === "inherit" || newMode === "closed") {
        updatedIntervals = [];
      } else if (newMode === "custom" && currentDay.mode !== "custom") {
        // Prefill from organization hours if available, else default interval
        const orgIntervals = orgHoursByWeekday[weekday] ?? [];
        if (orgIntervals.length > 0) {
          updatedIntervals = orgIntervals.map((iv) => ({
            id: crypto.randomUUID(),
            startStr: minuteToTime(iv.startMinute),
            endStr: minuteToTime(iv.endMinute),
          }));
        } else {
          updatedIntervals = [
            {
              id: crypto.randomUUID(),
              startStr: "09:00",
              endStr: "17:00",
            },
          ];
        }
      }

      return {
        ...prev,
        [weekday]: {
          mode: newMode,
          intervals: updatedIntervals,
        },
      };
    });
  };

  const handleAddInterval = (weekday: number) => {
    setSaveSuccess(false);
    setSaveError(null);
    setDraft((prev) => {
      const day = prev[weekday] ?? { mode: "custom", intervals: [] };
      const current = day.intervals;
      const last = current[current.length - 1];
      let newStart = "17:00";
      let newEnd = "21:00";
      if (last) {
        const parsedLastEnd = timeToMinute(last.endStr);
        if (parsedLastEnd !== null && parsedLastEnd < 1380) {
          newStart = minuteToTime(parsedLastEnd + 30);
          newEnd = minuteToTime(Math.min(1440, parsedLastEnd + 210));
        }
      }
      return {
        ...prev,
        [weekday]: {
          ...day,
          intervals: [
            ...current,
            { id: crypto.randomUUID(), startStr: newStart, endStr: newEnd },
          ],
        },
      };
    });
  };

  const handleIntervalChange = (
    weekday: number,
    index: number,
    updated: IntervalDraft,
  ) => {
    setSaveSuccess(false);
    setSaveError(null);
    setDraft((prev) => {
      const day = prev[weekday] ?? { mode: "custom", intervals: [] };
      const intervals = [...day.intervals];
      intervals[index] = updated;
      return {
        ...prev,
        [weekday]: { ...day, intervals },
      };
    });
  };

  const handleRemoveInterval = (weekday: number, index: number) => {
    setSaveSuccess(false);
    setSaveError(null);
    setDraft((prev) => {
      const day = prev[weekday] ?? { mode: "custom", intervals: [] };
      const intervals = day.intervals.filter((_, i) => i !== index);
      return {
        ...prev,
        [weekday]: { ...day, intervals },
      };
    });
  };

  const handleSave = async () => {
    if (
      isReadOnly ||
      isResourceInactive ||
      isSaving ||
      !isDirty ||
      hasAnyError ||
      !selectedResourceId
    ) {
      return;
    }
    setSaveError(null);
    setSaveSuccess(false);

    const daysPayload: ResourceWeekdayHours[] = [];
    for (let weekday = 1; weekday <= 7; weekday++) {
      const dayDraft = draft[weekday] ?? { mode: "inherit", intervals: [] };
      daysPayload.push({
        weekday,
        mode: dayDraft.mode,
        intervals:
          dayDraft.mode === "custom" ? parsedByWeekday[weekday].intervals : [],
      });
    }

    try {
      await onSave(daysPayload);
      setSaveSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save resource hours.";
      setSaveError(message);
    }
  };

  if (resources.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <h3 className="text-sm font-semibold text-foreground">
          No resources available for scheduling
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Create or link a resource before configuring individual availability.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Resource weekly hours
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure custom schedules for specific team resources or inherit
            organization hours.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="resource-select" className="sr-only">
            Select Resource
          </label>
          <div className="w-56">
            <Select
              value={selectedResourceId ?? ""}
              onValueChange={onSelectResource}
            >
              <SelectTrigger id="resource-select" className="h-9 text-xs">
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
              <AlertCircle aria-hidden="true" className="size-3 text-warning" />
              Inactive
            </span>
          )}
        </div>
      </div>

      {isLoadingResourceHours ? (
        <div
          aria-busy="true"
          className="divide-y divide-border p-6"
          role="status"
        >
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="h-4 w-28 rounded bg-border animate-pulse" />
              <div className="h-8 w-44 rounded bg-border animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {WEEKDAYS_SUNDAY_FIRST.map(({ weekday, label }) => {
            const dayDraft = draft[weekday] ?? {
              mode: "inherit",
              intervals: [],
            };
            const orgIntervals = orgHoursByWeekday[weekday] ?? [];
            const orgSummary = formatIntervalsSummary(orgIntervals);
            const { error } = parsedByWeekday[weekday];
            const isWritesDisabled =
              isReadOnly || isResourceInactive || isSaving;

            return (
              <div
                key={weekday}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6"
              >
                <div className="sm:w-36 sm:pt-1">
                  <span className="text-sm font-medium text-foreground">
                    {label}
                  </span>
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={dayDraft.mode}
                      onValueChange={(val) =>
                        handleModeChange(weekday, val as AvailabilityMode)
                      }
                      disabled={isWritesDisabled}
                    >
                      <SelectTrigger
                        aria-label={`Mode for ${label}`}
                        className="h-8 w-44 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit" className="text-xs">
                          Use organization hours
                        </SelectItem>
                        <SelectItem value="closed" className="text-xs">
                          Unavailable this day
                        </SelectItem>
                        <SelectItem value="custom" className="text-xs">
                          Custom hours
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {dayDraft.mode === "inherit" && (
                      <span className="text-xs text-muted-foreground">
                        {orgSummary}
                      </span>
                    )}

                    {dayDraft.mode === "closed" && (
                      <span className="text-xs text-muted-foreground">
                        Closed
                      </span>
                    )}
                  </div>

                  {dayDraft.mode === "custom" && (
                    <div className="space-y-2 pt-1">
                      {dayDraft.intervals.map((intervalDraft, idx) => (
                        <TimeIntervalInput
                          key={intervalDraft.id}
                          draft={intervalDraft}
                          disabled={isWritesDisabled}
                          dayLabel={label}
                          index={idx}
                          onChange={(updated) =>
                            handleIntervalChange(weekday, idx, updated)
                          }
                          onRemove={() => handleRemoveInterval(weekday, idx)}
                        />
                      ))}
                      {error && (
                        <p
                          role="alert"
                          className="text-xs font-medium text-danger"
                        >
                          {error}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-1">
                  {dayDraft.mode === "custom" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isWritesDisabled}
                      onClick={() => handleAddInterval(weekday)}
                      className="h-7 text-xs"
                    >
                      <Plus aria-hidden="true" className="size-3" />
                      Add interval
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 sm:px-6">
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
            >
              <Check aria-hidden="true" className="size-3.5" />
              Saved resource hours
            </span>
          )}
          {saveError && (
            <span role="alert" className="text-xs font-medium text-danger">
              {saveError}
            </span>
          )}
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={
            isReadOnly ||
            isResourceInactive ||
            isSaving ||
            !isDirty ||
            hasAnyError ||
            !selectedResourceId
          }
          className="text-xs"
        >
          {isSaving ? "Saving…" : "Save resource hours"}
        </Button>
      </div>
    </div>
  );
}
