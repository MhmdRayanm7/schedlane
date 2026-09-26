import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DateTime } from "luxon";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/cn";
import { formatLocalDate } from "@/shared/lib/date-time";
import styles from "../bookings.module.css";
import type { BookingsView } from "../lib/booking-date-range";

type BookingsToolbarProps = {
  date: DateTime;
  dateLabel: string;
  isCurrentRange: boolean;
  onDateChange: (date: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onToday: () => void;
  onViewChange: (view: BookingsView) => void;
  view: BookingsView;
};

export function BookingsToolbar({
  date,
  dateLabel,
  isCurrentRange,
  onDateChange,
  onNext,
  onPrevious,
  onToday,
  onViewChange,
  view,
}: BookingsToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarNavigation}>
        <Button
          className={cn(isCurrentRange && styles.currentRange)}
          disabled={isCurrentRange}
          onClick={onToday}
          variant="outline"
        >
          Today
        </Button>
        <Button
          aria-label={view === "day" ? "Previous day" : "Previous week"}
          onClick={onPrevious}
          size="icon"
          variant="ghost"
        >
          <ChevronLeft aria-hidden="true" className={styles.icon} />
        </Button>
        <Button
          aria-label={view === "day" ? "Next day" : "Next week"}
          onClick={onNext}
          size="icon"
          variant="ghost"
        >
          <ChevronRight aria-hidden="true" className={styles.icon} />
        </Button>
      </div>

      <div className={styles.rangeControls}>
        <p aria-live="polite" className={styles.rangeLabel}>
          {dateLabel}
        </p>
        <label className={styles.dateField} htmlFor="bookings-date">
          <span className={styles.visuallyHidden}>Jump to date</span>
          <Input
            aria-label="Jump to date"
            className={styles.dateInput}
            id="bookings-date"
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            value={formatLocalDate(date)}
          />
        </label>
      </div>

      <fieldset aria-label="Calendar view" className={styles.viewSwitch}>
        <legend className={styles.visuallyHidden}>Calendar view</legend>
        {(["day", "week"] as const).map((option) => (
          <button
            aria-pressed={view === option}
            className={styles.viewOption}
            key={option}
            onClick={() => onViewChange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
