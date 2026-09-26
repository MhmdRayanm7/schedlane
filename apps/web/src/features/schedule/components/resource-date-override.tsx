import { Plus } from "lucide-react";
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
import {
  areIntervalsEqual,
  formatIntervalsSummary,
  minuteToTime,
  timeToMinute,
  validateIntervals,
} from "../lib/time";
import type {
  AvailabilityMode,
  DateOverride,
  ManageableResource,
  MinuteInterval,
  ResourceWeeklyHoursResponse,
  WeeklyHoursResponse,
} from "../types";
import styles from "./schedule-exceptions.module.css";
import { type IntervalDraft, TimeIntervalInput } from "./time-interval-input";
import { TransientSaveStatus } from "./transient-save-status";

type ResourceDateOverrideProps = {
  date: string;
  weekday: number;
  resource: ManageableResource | undefined;
  override: DateOverride | undefined;
  resourceWeeklyHours: ResourceWeeklyHoursResponse | undefined;
  orgWeeklyHours: WeeklyHoursResponse | undefined;
  isReadOnly?: boolean;
  onSave: (data: {
    mode: AvailabilityMode;
    intervals: MinuteInterval[];
  }) => Promise<unknown>;
  isSaving: boolean;
};

export function ResourceDateOverride({
  date,
  weekday,
  resource,
  override,
  resourceWeeklyHours,
  orgWeeklyHours,
  isReadOnly = false,
  onSave,
  isSaving,
}: ResourceDateOverrideProps) {
  const isResourceInactive = Boolean(resource?.deactivatedAt);
  const isWritesDisabled = isReadOnly || isResourceInactive || isSaving;

  const currentMode = override?.mode ?? "inherit";
  const [mode, setMode] = useState<AvailabilityMode>(currentMode);
  const [intervalsDraft, setIntervalsDraft] = useState<IntervalDraft[]>([]);
  const { saveStatus, clearSaveSuccess, showSaveSuccess } =
    useTransientSaveStatus();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Derive normal effective schedule for this weekday
  const resourceDayConfig = resourceWeeklyHours?.days.find(
    (d) => d.weekday === weekday,
  );
  const orgDayConfig = orgWeeklyHours?.days.find((d) => d.weekday === weekday);

  let effectiveWeeklyIntervals: MinuteInterval[] = [];
  if (resourceDayConfig?.mode === "custom") {
    effectiveWeeklyIntervals = resourceDayConfig.intervals;
  } else if (resourceDayConfig?.mode === "closed") {
    effectiveWeeklyIntervals = [];
  } else {
    // inherit or fallback
    effectiveWeeklyIntervals = orgDayConfig?.intervals ?? [];
  }

  // Reset local state when override or date changes
  useEffect(() => {
    const nextMode = override?.mode ?? "inherit";
    setMode(nextMode);
    if (nextMode === "custom" && override?.intervals) {
      setIntervalsDraft(
        override.intervals.map((iv) => ({
          id: crypto.randomUUID(),
          startStr: minuteToTime(iv.startMinute),
          endStr: minuteToTime(iv.endMinute),
        })),
      );
    } else {
      setIntervalsDraft([]);
    }
    setSaveError(null);
  }, [override]);

  // Parse custom intervals and validate
  const parsedIntervals: MinuteInterval[] = [];
  let validationError: string | null = null;

  if (mode === "custom") {
    if (intervalsDraft.length === 0) {
      validationError = "At least one interval is required for custom hours.";
    } else {
      for (const d of intervalsDraft) {
        const start = timeToMinute(d.startStr);
        const end = timeToMinute(d.endStr);
        if (start === null) {
          validationError = `Invalid time "${d.startStr}". Use HH:mm format.`;
          break;
        }
        if (end === null) {
          validationError = `Invalid time "${d.endStr}". Use HH:mm format.`;
          break;
        }
        parsedIntervals.push({ startMinute: start, endMinute: end });
      }
      if (!validationError) {
        validationError = validateIntervals(parsedIntervals);
      }
    }
  }

  // Dirty check
  const serverMode = override?.mode ?? "inherit";
  const serverIntervals = override?.intervals ?? [];
  const isDirty =
    mode !== serverMode ||
    (mode === "custom" && !areIntervalsEqual(serverIntervals, parsedIntervals));

  const handleModeChange = (newMode: AvailabilityMode) => {
    clearSaveSuccess();
    setSaveError(null);
    setMode(newMode);

    if (newMode === "custom" && mode !== "custom") {
      // Prefill from effective weekly schedule
      if (effectiveWeeklyIntervals.length > 0) {
        setIntervalsDraft(
          effectiveWeeklyIntervals.map((iv) => ({
            id: crypto.randomUUID(),
            startStr: minuteToTime(iv.startMinute),
            endStr: minuteToTime(iv.endMinute),
          })),
        );
      } else {
        setIntervalsDraft([
          {
            id: crypto.randomUUID(),
            startStr: "09:00",
            endStr: "17:00",
          },
        ]);
      }
    } else if (newMode !== "custom") {
      setIntervalsDraft([]);
    }
  };

  const handleAddInterval = () => {
    clearSaveSuccess();
    setSaveError(null);
    const last = intervalsDraft[intervalsDraft.length - 1];
    let newStart = "17:00";
    let newEnd = "21:00";
    if (last) {
      const parsedLastEnd = timeToMinute(last.endStr);
      if (parsedLastEnd !== null && parsedLastEnd < 1380) {
        newStart = minuteToTime(parsedLastEnd + 30);
        newEnd = minuteToTime(Math.min(1440, parsedLastEnd + 210));
      }
    }
    setIntervalsDraft((prev) => [
      ...prev,
      { id: crypto.randomUUID(), startStr: newStart, endStr: newEnd },
    ]);
  };

  const handleIntervalChange = (index: number, updated: IntervalDraft) => {
    clearSaveSuccess();
    setSaveError(null);
    setIntervalsDraft((prev) => {
      const copy = [...prev];
      copy[index] = updated;
      return copy;
    });
  };

  const handleRemoveInterval = (index: number) => {
    clearSaveSuccess();
    setSaveError(null);
    setIntervalsDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (isWritesDisabled || !isDirty || validationError) return;
    setSaveError(null);
    clearSaveSuccess();

    try {
      await onSave({
        mode,
        intervals: mode === "custom" ? parsedIntervals : [],
      });
      showSaveSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to save resource exception.";
      setSaveError(message);
    }
  };

  if (!resource) return null;

  return (
    <div className={styles.override}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.title}>Resource exception: {resource.name}</h3>
        <p className={styles.description}>
          Override {resource.name}'s schedule on {date}.
        </p>
      </div>

      <div className={styles.sectionContent}>
        <div className={styles.modeRow}>
          <label htmlFor="resource-date-mode" className={styles.visuallyHidden}>
            Resource exception mode
          </label>
          <div className={styles.modeWrapper}>
            <Select
              value={mode}
              onValueChange={(val) => handleModeChange(val as AvailabilityMode)}
              disabled={isWritesDisabled}
            >
              <SelectTrigger
                id="resource-date-mode"
                className={styles.compactSelect}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit" className={styles.compactItem}>
                  Use normal schedule
                </SelectItem>
                <SelectItem value="closed" className={styles.compactItem}>
                  Closed on this date
                </SelectItem>
                <SelectItem value="custom" className={styles.compactItem}>
                  Custom hours
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "inherit" && (
            <span className={styles.summary}>
              Normal schedule:{" "}
              {formatIntervalsSummary(effectiveWeeklyIntervals)}
            </span>
          )}

          {mode === "closed" && (
            <span className={styles.summary}>
              Unavailable all day on this date.
            </span>
          )}
        </div>

        {mode === "custom" && (
          <div className={styles.customHours}>
            <div className={styles.intervals}>
              {intervalsDraft.map((draft, idx) => (
                <TimeIntervalInput
                  key={draft.id}
                  draft={draft}
                  disabled={isWritesDisabled}
                  dayLabel={`${resource.name} on ${date}`}
                  index={idx}
                  onChange={(updated) => handleIntervalChange(idx, updated)}
                  onRemove={() => handleRemoveInterval(idx)}
                />
              ))}
            </div>

            {validationError && (
              <p role="alert" className={styles.error}>
                {validationError}
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isWritesDisabled}
              onClick={handleAddInterval}
              className={styles.addButton}
            >
              <Plus aria-hidden="true" className={styles.tinyIcon} />
              Add interval
            </Button>
          </div>
        )}
      </div>

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
          disabled={isWritesDisabled || !isDirty || Boolean(validationError)}
          className={styles.saveButton}
          loading={isSaving}
        >
          Save resource exception
        </Button>
      </div>
    </div>
  );
}
