import { RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import styles from "../schedule.module.css";

export function ScheduleQueryError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className={styles.queryError}>
      <p className={styles.queryErrorMessage}>{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw aria-hidden="true" className={styles.smallIcon} />
        Retry
      </Button>
    </div>
  );
}
