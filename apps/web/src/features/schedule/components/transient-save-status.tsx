import { Check } from "lucide-react";
import type { SaveStatus } from "../hooks/use-transient-save-status";
import styles from "./time-input.module.css";

export function TransientSaveStatus({ status }: { status: SaveStatus }) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={styles.saveStatus}
      data-status={status}
    >
      {status !== "hidden" ? (
        <>
          <Check aria-hidden="true" className={styles.smallIcon} />
          Saved
        </>
      ) : null}
    </span>
  );
}
