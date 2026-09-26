import { AlertCircle, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useTransientSaveStatus } from "../hooks/use-transient-save-status";
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
import { TransientSaveStatus } from "./transient-save-status";
import styles from "./weekly-hours.module.css";

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
  const { saveStatus, clearSaveSuccess, showSaveSuccess } =
    useTransientSaveStatus();
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
    clearSaveSuccess();
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
    clearSaveSuccess();
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
    clearSaveSuccess();
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
    clearSaveSuccess();
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
    clearSaveSuccess();

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
      showSaveSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save resource hours.";
      setSaveError(message);
    }
  };

  if (resources.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h3 className={styles.emptyTitle}>
          No resources available for scheduling
        </h3>
        <p className={styles.emptyDescription}>
          Create or link a resource before configuring individual availability.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.resourceHeader}>
        <div>
          <h2 className={styles.title}>Resource weekly hours</h2>
          <p className={styles.description}>
            Set custom hours or inherit the organization schedule.
          </p>
        </div>

        <div className={styles.resourceControls}>
          <label htmlFor="resource-select" className={styles.visuallyHidden}>
            Select Resource
          </label>
          <div className={styles.selectWrapper}>
            <Select
              value={selectedResourceId ?? ""}
              onValueChange={onSelectResource}
            >
              <SelectTrigger
                id="resource-select"
                className={styles.compactSelect}
              >
                <SelectValue placeholder="Select resource" />
              </SelectTrigger>
              <SelectContent>
                {resources.map((r) => (
                  <SelectItem
                    key={r.id}
                    value={r.id}
                    className={styles.compactSelect}
                  >
                    {r.name} {r.deactivatedAt ? "(Inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isResourceInactive && (
            <span className={styles.inactiveNotice} role="status">
              <AlertCircle aria-hidden="true" className={styles.warningIcon} />
              Inactive
            </span>
          )}
        </div>
      </div>

      {isLoadingResourceHours ? (
        <div aria-busy="true" className={styles.loading} role="status">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className={styles.loadingRow}>
              <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
              <div className={`${styles.skeleton} ${styles.skeletonControl}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.days}>
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
              <div key={weekday} className={styles.dayRow}>
                <div className={styles.resourceDayHeading}>
                  <span className={styles.dayName}>{label}</span>
                </div>

                <div className={styles.dayContent}>
                  <div className={styles.modeRow}>
                    <Select
                      value={dayDraft.mode}
                      onValueChange={(val) =>
                        handleModeChange(weekday, val as AvailabilityMode)
                      }
                      disabled={isWritesDisabled}
                    >
                      <SelectTrigger
                        aria-label={`Mode for ${label}`}
                        className={styles.modeSelect}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="inherit"
                          className={styles.compactSelect}
                        >
                          Use organization hours
                        </SelectItem>
                        <SelectItem
                          value="closed"
                          className={styles.compactSelect}
                        >
                          Unavailable this day
                        </SelectItem>
                        <SelectItem
                          value="custom"
                          className={styles.compactSelect}
                        >
                          Custom hours
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {dayDraft.mode === "inherit" && (
                      <span className={styles.summary}>{orgSummary}</span>
                    )}

                    {dayDraft.mode === "closed" && (
                      <span className={styles.summary}>Closed</span>
                    )}
                  </div>

                  {dayDraft.mode === "custom" && (
                    <div className={styles.customIntervals}>
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
                        <p role="alert" className={styles.error}>
                          {error}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className={styles.dayActions}>
                  {dayDraft.mode === "custom" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isWritesDisabled}
                      onClick={() => handleAddInterval(weekday)}
                      className={styles.addButton}
                      aria-label={`Add interval for ${label}`}
                      title="Add interval"
                    >
                      <Plus aria-hidden="true" className={styles.icon} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.footer}>
        <div className={styles.feedback}>
          {!saveError && <TransientSaveStatus status={saveStatus} />}
          {saveError && (
            <span role="alert" className={styles.error}>
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
          className={styles.saveButton}
          loading={isSaving}
        >
          Save resource hours
        </Button>
      </div>
    </div>
  );
}
