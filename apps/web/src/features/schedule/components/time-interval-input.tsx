import { Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

export type IntervalDraft = {
  id: string;
  startStr: string;
  endStr: string;
};

type TimeIntervalInputProps = {
  draft: IntervalDraft;
  disabled?: boolean;
  onChange: (draft: IntervalDraft) => void;
  onRemove: () => void;
  dayLabel: string;
  index: number;
};

export function TimeIntervalInput({
  draft,
  disabled = false,
  onChange,
  onRemove,
  dayLabel,
  index,
}: TimeIntervalInputProps) {
  const startId = `${dayLabel.toLowerCase()}-start-${index}`;
  const endId = `${dayLabel.toLowerCase()}-end-${index}`;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <label htmlFor={startId} className="sr-only">
          {dayLabel} interval {index + 1} start time
        </label>
        <Input
          id={startId}
          type="text"
          value={draft.startStr}
          placeholder="09:00"
          disabled={disabled}
          maxLength={5}
          onChange={(e) => onChange({ ...draft, startStr: e.target.value })}
          className="h-8 w-20 px-2 text-center font-mono text-xs"
        />
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          –
        </span>
        <label htmlFor={endId} className="sr-only">
          {dayLabel} interval {index + 1} end time
        </label>
        <Input
          id={endId}
          type="text"
          value={draft.endStr}
          placeholder="17:00"
          disabled={disabled}
          maxLength={5}
          onChange={(e) => onChange({ ...draft, endStr: e.target.value })}
          className="h-8 w-20 px-2 text-center font-mono text-xs"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove interval ${index + 1} for ${dayLabel}`}
        className="size-8 text-muted-foreground hover:text-danger"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}
