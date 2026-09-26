import { BrandLockup } from "@/shared/brand/brand-lockup";
import styles from "../auth.module.css";

export function BrandedLoadingState() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading Schedlane"
      className={styles.loadingPage}
    >
      <div className={styles.loadingContent}>
        <BrandLockup
          markClassName={styles.loadingMark}
          wordmarkClassName={styles.loadingWordmark}
        />
        <span className={styles.spinner} />
      </div>
    </main>
  );
}
