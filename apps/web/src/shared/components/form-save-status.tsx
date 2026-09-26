import { Check } from "lucide-react";
import styles from "./form-save-status.module.css";

export type SaveSuccessState = "hidden" | "visible" | "fading";

type FormSaveStatusProps = {
  dirty: boolean;
  saving: boolean;
  successState: SaveSuccessState;
};

export function FormSaveStatus({
  dirty,
  saving,
  successState,
}: FormSaveStatusProps) {
  const state = saving
    ? "saving"
    : successState === "visible"
      ? "saved"
      : successState === "fading"
        ? "fading"
        : dirty
          ? "unsaved"
          : "empty";

  return (
    <span
      aria-atomic="true"
      aria-live="polite"
      className={styles.status}
      data-state={state}
    >
      {state === "unsaved" ? (
        <>
          <span aria-hidden="true" className={styles.dot} />
          Unsaved changes
        </>
      ) : null}
      {state === "saved" || state === "fading" ? (
        <>
          <Check aria-hidden="true" className={styles.icon} />
          Saved
        </>
      ) : null}
      {state === "saving" ? (
        <span className={styles.visuallyHidden}>Saving changes</span>
      ) : null}
    </span>
  );
}
