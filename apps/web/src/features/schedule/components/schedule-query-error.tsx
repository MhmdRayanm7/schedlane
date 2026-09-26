import { RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export function ScheduleQueryError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-destructive bg-destructive-subtle px-3 py-2"
    >
      <p className="text-sm text-destructive">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw aria-hidden="true" className="size-3.5" />
        Retry
      </Button>
    </div>
  );
}
