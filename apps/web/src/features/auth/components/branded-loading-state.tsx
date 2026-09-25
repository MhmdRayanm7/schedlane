import { BrandLockup } from "@/shared/brand/brand-lockup";

export function BrandedLoadingState() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading Schedlane"
      className="flex min-h-dvh items-center justify-center bg-background"
    >
      <div className="flex flex-col items-center gap-4">
        <BrandLockup markClassName="size-7" wordmarkClassName="text-lg" />
        <span className="size-5 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
      </div>
    </main>
  );
}
