import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { useTransientSaveStatus } from "../hooks/use-transient-save-status";
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
import { TransientSaveStatus } from "./transient-save-status";
import styles from "./weekly-hours.module.css";

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
  const { saveStatus, clearSaveSuccess, showSaveSuccess } =
    useTransientSaveStatus();
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
    clearSaveSuccess();
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
    clearSaveSuccess();
    setSaveError(null);
    setDraft((prev) => ({
      ...prev,
      [weekday]: [],
    }));
  };

  const handleAddInterval = (weekday: number) => {
    clearSaveSuccess();
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
    clearSaveSuccess();
    setSaveError(null);
    setDraft((prev) => {
      const dayDrafts = [...(prev[weekday] ?? [])];
      dayDrafts[index] = updated;
      return { ...prev, [weekday]: dayDrafts };
    });
  };

  const handleRemoveInterval = (weekday: number, index: number) => {
    clearSaveSuccess();
    setSaveError(null);
    setDraft((prev) => {
      const dayDrafts = (prev[weekday] ?? []).filter((_, i) => i !== index);
      return { ...prev, [weekday]: dayDrafts };
    });
  };

  const handleSave = async () => {
    if (isReadOnly || isSaving || !isDirty || hasAnyError) return;
    setSaveError(null);
    clearSaveSuccess();

    const daysPayload: WeekdayHours[] = [];
    for (let weekday = 1; weekday <= 7; weekday++) {
      daysPayload.push({
        weekday,
        intervals: parsedByWeekday[weekday].intervals,
      });
    }

    try {
      await onSave(daysPayload);
      showSaveSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save weekly hours.";
      setSaveError(message);
    }
  };

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h2 className={styles.title}>Organization business hours</h2>
        <p className={styles.description}>
          Set the default operating schedule for your organization. Resources
          can inherit or override these hours.
        </p>
      </div>

      <div className={styles.days}>
        {WEEKDAYS_SUNDAY_FIRST.map(({ weekday, label }) => {
          const dayDrafts = draft[weekday] ?? [];
          const isOpen = dayDrafts.length > 0;
          const { error } = parsedByWeekday[weekday];

          return (
            <div key={weekday} className={styles.dayRow}>
              <div className={styles.dayHeading}>
                <input
                  type="checkbox"
                  className={styles.dayToggle}
                  aria-label={`${label} open`}
                  checked={isOpen}
                  disabled={isReadOnly || isSaving}
                  onChange={(event) =>
                    event.target.checked
                      ? handleDayToggleOpen(weekday)
                      : handleDayClose(weekday)
                  }
                />
                <span className={styles.dayName}>{label}</span>
              </div>

              <div className={styles.dayContent}>
                {isOpen ? (
                  <div className={styles.intervals}>
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
                      <p role="alert" className={styles.error}>
                        {error}
                      </p>
                    )}
                  </div>
                ) : (
                  <span className={styles.summary}>
                    No operating hours configured
                  </span>
                )}
              </div>

              <div className={styles.dayActions}>
                {isOpen ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isReadOnly || isSaving}
                    onClick={() => handleAddInterval(weekday)}
                    className={styles.addButton}
                    aria-label={`Add interval for ${label}`}
                    title="Add interval"
                  >
                    <Plus aria-hidden="true" className={styles.icon} />
                  </Button>
                ) : (
                  <span className={styles.closedLabel}>Closed</span>
                )}
              </div>
            </div>
          );
        })}
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
          disabled={isReadOnly || isSaving || !isDirty || hasAnyError}
          className={styles.saveButton}
          loading={isSaving}
        >
          Save business hours
        </Button>
      </div>
    </div>
  );
}
