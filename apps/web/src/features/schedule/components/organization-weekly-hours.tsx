import { Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { WEEKDAYS_SUNDAY_FIRST } from "../lib/constants";
import {
  areIntervalsEqual,
  minuteToTime,
  timeToMinute,
  validateIntervals,
} from "../lib/time";
import type {
  MinuteInterval,
  WeekdayHours,
  WeeklyHoursResponse,
} from "../types";
import { type IntervalDraft, TimeIntervalInput } from "./time-interval-input";

type OrganizationWeeklyHoursProps = {
  data: WeeklyHoursResponse;
  isReadOnly?: boolean;
  onSave: (days: WeekdayHours[]) => Promise<unknown>;
  isSaving: boolean;
};

function initDraft(data: WeeklyHoursResponse): Record<number, IntervalDraft[]> {
  const map: Record<number, IntervalDraft[]> = {};
  for (let weekday = 1; weekday <= 7; weekday++) {
    const day = data.days.find((d) => d.weekday === weekday);
    const intervals = day?.intervals ?? [];
    map[weekday] = intervals.map((iv) => ({
      id: crypto.randomUUID(),
      startStr: minuteToTime(iv.startMinute),
      endStr: minuteToTime(iv.endMinute),
    }));
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

export function OrganizationWeeklyHours({
  data,
  isReadOnly = false,
  onSave,
  isSaving,
}: OrganizationWeeklyHoursProps) {
  const [draft, setDraft] = useState<Record<number, IntervalDraft[]>>(() =>
    initDraft(data),
  );
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync draft when data changes
  useEffect(() => {
    setDraft(initDraft(data));
  }, [data]);

  // Evaluate parsed intervals and errors for all days
  const parsedByWeekday: Record<
    number,
    { intervals: MinuteInterval[]; error: string | null }
  > = {};
  let hasAnyError = false;

  for (let weekday = 1; weekday <= 7; weekday++) {
    const parsed = parseDraftsForWeekday(draft[weekday] ?? []);
    parsedByWeekday[weekday] = parsed;
    if (parsed.error) {
      hasAnyError = true;
    }
  }

  // Check if draft is dirty
  const isDirty = WEEKDAYS_SUNDAY_FIRST.some(({ weekday }) => {
    const serverDay = data.days.find((d) => d.weekday === weekday);
    const serverIntervals = serverDay?.intervals ?? [];
    const clientIntervals = parsedByWeekday[weekday].intervals;
    return !areIntervalsEqual(serverIntervals, clientIntervals);
  });

  const handleDayToggleOpen = (weekday: number) => {
    setSaveSuccess(false);
    setSaveError(null);
    setDraft((prev) => ({
      ...prev,
      [weekday]: [
        {
          id: crypto.randomUUID(),
          startStr: "09:00",
          endStr: "17:00",
        },
      ],
    }));
  };

  const handleDayClose = (weekday: number) => {
    setSaveSuccess(false);
    setSaveError(null);
    setDraft((prev) => ({
      ...prev,
      [weekday]: [],
    }));
  };

  const handleAddInterval = (weekday: number) => {
    setSaveSuccess(false);
    setSaveError(null);
    const current = draft[weekday] ?? [];
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
    setDraft((prev) => ({
      ...prev,
      [weekday]: [
        ...current,
        { id: crypto.randomUUID(), startStr: newStart, endStr: newEnd },
      ],
    }));
  };

  const handleIntervalChange = (
    weekday: number,
    index: number,
    updated: IntervalDraft,
  ) => {
    setSaveSuccess(false);
    setSaveError(null);
    setDraft((prev) => {
      const dayDrafts = [...(prev[weekday] ?? [])];
      dayDrafts[index] = updated;
      return { ...prev, [weekday]: dayDrafts };
    });
  };

  const handleRemoveInterval = (weekday: number, index: number) => {
    setSaveSuccess(false);
    setSaveError(null);
    setDraft((prev) => {
      const dayDrafts = (prev[weekday] ?? []).filter((_, i) => i !== index);
      return { ...prev, [weekday]: dayDrafts };
    });
  };

  const handleSave = async () => {
    if (isReadOnly || isSaving || !isDirty || hasAnyError) return;
    setSaveError(null);
    setSaveSuccess(false);

    const daysPayload: WeekdayHours[] = [];
    for (let weekday = 1; weekday <= 7; weekday++) {
      daysPayload.push({
        weekday,
        intervals: parsedByWeekday[weekday].intervals,
      });
    }

    try {
      await onSave(daysPayload);
      setSaveSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save weekly hours.";
      setSaveError(message);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-4 sm:px-6">
        <h2 className="text-base font-semibold text-foreground">
          Organization business hours
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Set the default operating schedule for your organization. Resources
          can inherit or override these hours.
        </p>
      </div>

      <div className="divide-y divide-border">
        {WEEKDAYS_SUNDAY_FIRST.map(({ weekday, label }) => {
          const dayDrafts = draft[weekday] ?? [];
          const isOpen = dayDrafts.length > 0;
          const { error } = parsedByWeekday[weekday];

          return (
            <div
              key={weekday}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6"
            >
              <div className="flex items-center gap-3 sm:w-36 sm:pt-1">
                <span className="w-24 text-sm font-medium text-foreground">
                  {label}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isOpen
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-subtle text-muted-foreground"
                  }`}
                >
                  {isOpen ? "Open" : "Closed"}
                </span>
              </div>

              <div className="flex-1 space-y-2">
                {isOpen ? (
                  <div className="space-y-2">
                    {dayDrafts.map((intervalDraft, idx) => (
                      <TimeIntervalInput
                        key={intervalDraft.id}
                        draft={intervalDraft}
                        disabled={isReadOnly || isSaving}
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
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No operating hours configured
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                {isOpen ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isReadOnly || isSaving}
                      onClick={() => handleAddInterval(weekday)}
                      className="h-7 text-xs"
                    >
                      <Plus aria-hidden="true" className="size-3" />
                      Add interval
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isReadOnly || isSaving}
                      onClick={() => handleDayClose(weekday)}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isReadOnly || isSaving}
                    onClick={() => handleDayToggleOpen(weekday)}
                    className="h-7 text-xs"
                  >
                    Open
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 sm:px-6">
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
            >
              <Check aria-hidden="true" className="size-3.5" />
              Saved business hours
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
          disabled={isReadOnly || isSaving || !isDirty || hasAnyError}
          className="text-xs"
        >
          {isSaving ? "Saving…" : "Save business hours"}
        </Button>
      </div>
    </div>
  );
}
