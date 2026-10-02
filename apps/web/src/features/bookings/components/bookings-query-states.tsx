import { QueryErrorState } from "@/shared/components/app-state-page";
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

export function BookingsErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <QueryErrorState
      error={error}
      onRetry={retry}
      title="Couldn't load bookings"
    />
  );
}
