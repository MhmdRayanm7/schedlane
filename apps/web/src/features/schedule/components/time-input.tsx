import { useId } from "react";
import { Input } from "@/shared/components/ui/input";
import styles from "./time-input.module.css";

type TimeInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  boundary: "start" | "end";
  disabled?: boolean;
};

export function TimeInput({
  label,
  value,
  onChange,
  boundary,
  disabled,
}: TimeInputProps) {
  const id = useId();
  const [hour = "", minute = ""] = value.split(":");
  const isEndOfDay = boundary === "end" && hour === "24";

  function changePart(part: "hour" | "minute", next: string) {
    if (!/^\d{0,2}$/.test(next)) return;
    const max = part === "hour" ? (boundary === "end" ? 24 : 23) : 59;
    if (next !== "" && Number(next) > max) return;
    const nextHour = part === "hour" ? next : hour;
    const nextMinute = part === "minute" ? next : minute;
    // 24:00 is the end boundary 1440, never same-day midnight (00:00).
    onChange(
      `${nextHour}:${boundary === "end" && nextHour === "24" ? "00" : nextMinute}`,
    );
  }

  function padPart(part: "hour" | "minute") {
    const current = part === "hour" ? hour : minute;
    if (current !== "") changePart(part, current.padStart(2, "0"));
  }

  return (
    <fieldset aria-labelledby={id} className={styles.timeInput}>
      <span id={id} className={styles.visuallyHidden}>
        {label}
      </span>
      <Input
        aria-label={`${label} hour`}
        autoComplete="off"
        className={styles.part}
        disabled={disabled}
        inputMode="numeric"
        maxLength={2}
        onBlur={() => padPart("hour")}
        onChange={(event) => changePart("hour", event.target.value)}
        onFocus={(event) => event.target.select()}
        placeholder="HH"
        value={hour}
      />
      <span aria-hidden="true" className={styles.separator}>
        :
      </span>
      <Input
        aria-label={`${label} minute`}
        aria-invalid={boundary === "end" && hour === "00" && minute === "00"}
        autoComplete="off"
        className={styles.part}
        disabled={disabled || isEndOfDay}
        inputMode="numeric"
        maxLength={2}
        onBlur={() => padPart("minute")}
        onChange={(event) => changePart("minute", event.target.value)}
        onFocus={(event) => event.target.select()}
        placeholder="MM"
        value={minute}
      />
    </fieldset>
  );
}
