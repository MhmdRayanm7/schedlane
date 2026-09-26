import { useRef } from "react";

// Carry the original trigger across surfaces while the outgoing overlay animates.
const overlayOrigins = new WeakMap<HTMLElement, HTMLElement>();

export function useOverlayFocus() {
  const returnFocus = useRef<HTMLElement | null>(null);

  return {
    onOpenAutoFocus: (event: Event) => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        const previousOverlay = active.closest<HTMLElement>('[role="dialog"]');
        returnFocus.current =
          (previousOverlay && overlayOrigins.get(previousOverlay)) || active;
      }
      if (event.target instanceof HTMLElement && returnFocus.current) {
        overlayOrigins.set(event.target, returnFocus.current);
      }
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      // A newly opened editing surface owns focus during a Sheet/Dialog handoff.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const target = returnFocus.current;
      if (target?.isConnected && target !== document.body) {
        target.focus({ preventScroll: true });
      } else {
        document.querySelector<HTMLElement>("main h1")?.focus();
      }
    },
  };
}
