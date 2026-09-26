import { RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/cn";

export function BookingsLoadingState() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading bookings"
      className="divide-y divide-border"
      role="status"
    >
      <span className="sr-only">Loading bookings</span>
      {["one", "two", "three", "four"].map((item, index) => (
        <div className="flex py-5" key={item}>
          <div className="w-[88px] shrink-0 pr-4">
            <span className="block h-4 w-10 animate-pulse rounded bg-[#e9edec]" />
          </div>
          <div className="flex-1">
            <span className="block h-4 w-32 animate-pulse rounded bg-border" />
            <span className="mt-2 block h-3 w-48 max-w-full animate-pulse rounded bg-[#edf0ef]" />
          </div>
          <span
            className={cn(
              "hidden h-6 w-20 animate-pulse rounded bg-[#edf0ef] sm:block",
              index > 2 && "opacity-60",
            )}
          />
        </div>
      ))}
    </div>
  );
}

export function BookingsErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="py-16 text-center" role="alert">
      <h2 className="text-base font-semibold">Couldn't load bookings</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Check your connection and try again.
      </p>
      <Button className="mt-5" onClick={retry} variant="outline">
        <RefreshCw aria-hidden="true" className="size-4" />
        Retry
      </Button>
    </div>
  );
}
