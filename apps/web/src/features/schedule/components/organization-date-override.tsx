import { Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
  MinuteInterval,
  WeeklyHoursResponse,
} from "../types";
import { type IntervalDraft, TimeIntervalInput } from "./time-interval-input";

type OrganizationDateOverrideProps = {
  date: string;
  weekday: number;
  override: DateOverride | undefined;
  orgWeeklyHours: WeeklyHoursResponse | undefined;
  isReadOnly?: boolean;
  onSave: (data: {
    mode: AvailabilityMode;
    intervals: MinuteInterval[];
  }) => Promise<unknown>;
  isSaving: boolean;
};

export function OrganizationDateOverride({
  date,
  weekday,
  override,
  orgWeeklyHours,
  isReadOnly = false,
  onSave,
  isSaving,
}: OrganizationDateOverrideProps) {
  const currentMode = override?.mode ?? "inherit";
  const [mode, setMode] = useState<AvailabilityMode>(currentMode);
  const [intervalsDraft, setIntervalsDraft] = useState<IntervalDraft[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Normal weekly intervals for this weekday
  const normalWeeklyIntervals =
    orgWeeklyHours?.days.find((d) => d.weekday === weekday)?.intervals ?? [];

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
    setSaveSuccess(false);
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
    setSaveSuccess(false);
    setSaveError(null);
    setMode(newMode);

    if (newMode === "custom" && mode !== "custom") {
      // Prefill from organization weekly hours if available
      if (normalWeeklyIntervals.length > 0) {
        setIntervalsDraft(
          normalWeeklyIntervals.map((iv) => ({
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
    setSaveSuccess(false);
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
    setSaveSuccess(false);
    setSaveError(null);
    setIntervalsDraft((prev) => {
      const copy = [...prev];
      copy[index] = updated;
      return copy;
    });
  };

  const handleRemoveInterval = (index: number) => {
    setSaveSuccess(false);
    setSaveError(null);
    setIntervalsDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (isReadOnly || isSaving || !isDirty || validationError) return;
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await onSave({
        mode,
        intervals: mode === "custom" ? parsedIntervals : [],
      });
      setSaveSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save date override.";
      setSaveError(message);
    }
  };

  return (
    <div className="border-t border-border">
      <div className="py-4">
        <h3 className="text-sm font-semibold text-foreground">
          Organization exception
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Override organization operating hours on {date}.
        </p>
      </div>

      <div className="space-y-4 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="org-date-mode" className="sr-only">
            Organization exception mode
          </label>
          <div className="w-48">
            <Select
              value={mode}
              onValueChange={(val) => handleModeChange(val as AvailabilityMode)}
              disabled={isReadOnly || isSaving}
            >
              <SelectTrigger id="org-date-mode" className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit" className="text-xs">
                  Use weekly hours
                </SelectItem>
                <SelectItem value="closed" className="text-xs">
                  Closed all day
                </SelectItem>
                <SelectItem value="custom" className="text-xs">
                  Custom hours
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "inherit" && (
            <span className="text-xs text-muted-foreground">
              Normal hours: {formatIntervalsSummary(normalWeeklyIntervals)}
            </span>
          )}

          {mode === "closed" && (
            <span className="text-xs text-muted-foreground">
              Organization is closed all day on this date.
            </span>
          )}
        </div>

        {mode === "custom" && (
          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              {intervalsDraft.map((draft, idx) => (
                <TimeIntervalInput
                  key={draft.id}
                  draft={draft}
                  disabled={isReadOnly || isSaving}
                  dayLabel={`Exception on ${date}`}
                  index={idx}
                  onChange={(updated) => handleIntervalChange(idx, updated)}
                  onRemove={() => handleRemoveInterval(idx)}
                />
              ))}
            </div>

            {validationError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {validationError}
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isReadOnly || isSaving}
              onClick={handleAddInterval}
              className="h-9 text-xs"
            >
              <Plus aria-hidden="true" className="size-3" />
              Add interval
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4">
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
            >
              <Check aria-hidden="true" className="size-3.5" />
              Saved organization exception
            </span>
          )}
          {saveError && (
            <span role="alert" className="text-sm font-medium text-destructive">
              {saveError}
            </span>
          )}
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={
            isReadOnly || isSaving || !isDirty || Boolean(validationError)
          }
          className="text-sm"
          loading={isSaving}
        >
          Save organization exception
        </Button>
      </div>
    </div>
  );
}
