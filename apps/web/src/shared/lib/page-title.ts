import { useEffect } from "react";

export function formatPageTitle(title?: string): string {
  const trimmed = title?.trim();
  if (!trimmed) {
    return "Schedlane";
  }
  if (
    trimmed.endsWith("Schedlane") ||
    trimmed.includes("— Book Appointment") ||
    trimmed.includes("— Manage Booking")
  ) {
    return trimmed;
  }
  return `${trimmed} — Schedlane`;
}

export function usePageTitle(title?: string): void {
  useEffect(() => {
    const formatted = formatPageTitle(title);
    if (typeof document !== "undefined") {
      document.title = formatted;
    }
    return () => {
      if (typeof document !== "undefined") {
        document.title = "Schedlane";
      }
    };
  }, [title]);
}
