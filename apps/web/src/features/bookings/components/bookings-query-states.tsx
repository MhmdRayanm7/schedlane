import { RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/cn";
import styles from "../bookings.module.css";

export function BookingsLoadingState() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading bookings"
      className={styles.loadingList}
      role="status"
    >
      <span className={styles.visuallyHidden}>Loading bookings</span>
      {["one", "two", "three", "four"].map((item, index) => (
        <div className={styles.loadingRow} key={item}>
          <div className={styles.loadingTime}>
            <span className={cn(styles.skeleton, styles.skeletonTime)} />
          </div>
          <div className={styles.loadingContent}>
            <span className={cn(styles.skeleton, styles.skeletonTitle)} />
            <span className={cn(styles.skeleton, styles.skeletonDescription)} />
          </div>
          <span
            className={cn(
              styles.skeleton,
              styles.skeletonStatus,
              index > 2 && styles.skeletonFaded,
            )}
          />
        </div>
      ))}
    </div>
  );
}

export function BookingsErrorState({ retry }: { retry: () => void }) {
  return (
    <div className={styles.errorState} role="alert">
      <h2 className={styles.stateTitle}>Couldn't load bookings</h2>
      <p className={styles.stateDescription}>
        Check your connection and try again.
      </p>
      <Button className={styles.stateAction} onClick={retry} variant="outline">
        <RefreshCw aria-hidden="true" className={styles.icon} />
        Retry
      </Button>
    </div>
  );
}
