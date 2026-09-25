import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DateTime } from "luxon";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/cn";
import { formatLocalDate } from "@/shared/lib/date-time";
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
    <div className="relative flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Button
          className={cn(isCurrentRange && "text-subtle-foreground")}
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
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label={view === "day" ? "Next day" : "Next week"}
          onClick={onNext}
          size="icon"
          variant="ghost"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
        <p
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-sm font-semibold tabular-nums sm:min-w-44 sm:text-center"
        >
          {dateLabel}
        </p>
        <label className="relative shrink-0" htmlFor="bookings-date">
          <span className="sr-only">Jump to date</span>
          <Input
            aria-label="Jump to date"
            className="h-9 w-[132px] px-2 text-xs"
            id="bookings-date"
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            value={formatLocalDate(date)}
          />
        </label>
      </div>

      <fieldset
        aria-label="Calendar view"
        className="inline-flex w-fit rounded-md border border-border-strong bg-background p-0.5"
      >
        <legend className="sr-only">Calendar view</legend>
        {(["day", "week"] as const).map((option) => (
          <button
            aria-pressed={view === option}
            className={cn(
              "h-8 rounded px-3 text-xs font-medium capitalize text-muted-foreground transition-colors duration-150 hover:text-foreground",
              view === option && "bg-surface text-foreground shadow-sm",
            )}
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
