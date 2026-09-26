import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "hidden" | "visible" | "fading";

export function useTransientSaveStatus() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("hidden");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancelTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => cancelTimers, [cancelTimers]);

  const clearSaveSuccess = useCallback(() => {
    cancelTimers();
    setSaveStatus("hidden");
  }, [cancelTimers]);

  const showSaveSuccess = useCallback(() => {
    cancelTimers();
    setSaveStatus("visible");
    timers.current = [
      setTimeout(() => setSaveStatus("fading"), 2500),
      setTimeout(() => setSaveStatus("hidden"), 2700),
    ];
  }, [cancelTimers]);

  return { saveStatus, clearSaveSuccess, showSaveSuccess };
}
