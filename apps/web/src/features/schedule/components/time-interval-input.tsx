import { Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { TimeInput } from "./time-input";
import styles from "./time-input.module.css";

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
  return (
    <div className={styles.interval}>
      <div className={styles.intervalInputs}>
        <TimeInput
          label={`${dayLabel} interval ${index + 1} start`}
          boundary="start"
          value={draft.startStr}
          disabled={disabled}
          onChange={(value) => onChange({ ...draft, startStr: value })}
        />
        <span aria-hidden="true" className={styles.rangeSeparator}>
          –
        </span>
        <TimeInput
          label={`${dayLabel} interval ${index + 1} end`}
          boundary="end"
          value={draft.endStr}
          disabled={disabled}
          onChange={(value) => onChange({ ...draft, endStr: value })}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove interval ${index + 1} for ${dayLabel}`}
        title="Remove interval"
        className={styles.remove}
      >
        <Trash2 aria-hidden="true" className={styles.smallIcon} />
      </Button>
    </div>
  );
}
