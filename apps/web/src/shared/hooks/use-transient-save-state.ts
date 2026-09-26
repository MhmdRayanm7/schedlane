import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveSuccessState } from "../components/form-save-status";

const SUCCESS_VISIBLE_MS = 2200;
const SUCCESS_EXIT_MS = 140;

type UseTransientSaveStateOptions = {
  saving: boolean;
};

export function useTransientSaveState({
  saving,
}: UseTransientSaveStateOptions) {
  const [successState, setSuccessState] = useState<SaveSuccessState>("hidden");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancelTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const clearSaveSuccess = useCallback(() => {
    cancelTimers();
    setSuccessState("hidden");
  }, [cancelTimers]);

  const showSaveSuccess = useCallback(() => {
    cancelTimers();
    setSuccessState("visible");
    timers.current = [
      setTimeout(() => setSuccessState("fading"), SUCCESS_VISIBLE_MS),
      setTimeout(
        () => setSuccessState("hidden"),
        SUCCESS_VISIBLE_MS + SUCCESS_EXIT_MS,
      ),
    ];
  }, [cancelTimers]);

  useEffect(() => cancelTimers, [cancelTimers]);

  useEffect(() => {
    if (saving) clearSaveSuccess();
  }, [clearSaveSuccess, saving]);

  return { successState, clearSaveSuccess, showSaveSuccess };
}
