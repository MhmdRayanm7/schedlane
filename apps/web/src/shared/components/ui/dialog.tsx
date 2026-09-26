import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";
import { useOverlayFocus } from "./use-overlay-focus";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  children,
  className,
  "aria-busy": busy,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  const focus = useOverlayFocus();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-[60] bg-foreground/30",
          "data-[state=closed]:animate-[sheet-overlay-out_150ms_ease-in] data-[state=open]:animate-[sheet-overlay-in_180ms_ease-out]",
        )}
      />
      <DialogPrimitive.Content
        aria-busy={busy}
        className={cn(
          "fixed left-1/2 top-1/2 z-[60] flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
          "max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[480px]",
          "rounded-lg border border-border bg-surface",
          "shadow-xl outline-none",
          "data-[state=open]:animate-[dialog-in_180ms_ease-out] data-[state=closed]:animate-[dialog-out_140ms_ease-in]",
          className,
        )}
        {...focus}
        {...props}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pt-2 [overflow-wrap:anywhere] sm:p-6 sm:pt-2">
          {children}
        </div>
        <div className="order-first flex h-12 shrink-0 items-center justify-end px-2">
          <DialogPrimitive.Close
            disabled={busy === true || busy === "true"}
            className={cn(
              "flex size-10 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors duration-150",
              "hover:bg-surface-hover hover:text-foreground",
              "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              "disabled:pointer-events-none disabled:opacity-65",
            )}
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Close dialog</span>
          </DialogPrimitive.Close>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "text-lg font-semibold leading-7 [overflow-wrap:anywhere]",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("mt-2 text-sm leading-6 text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
};
