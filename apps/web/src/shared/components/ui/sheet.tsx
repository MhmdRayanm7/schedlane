import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";
import { useOverlayFocus } from "./use-overlay-focus";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

function SheetContent({
  children,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  const focus = useOverlayFocus();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-foreground/25",
          "data-[state=closed]:animate-[sheet-overlay-out_150ms_ease-in] data-[state=open]:animate-[sheet-overlay-in_180ms_ease-out]",
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden",
          "w-full max-w-[460px]",
          "border-l border-border bg-surface",
          "shadow-lg outline-none",
          "data-[state=closed]:animate-[sheet-out_150ms_ease-in] data-[state=open]:animate-[sheet-in_190ms_ease-out]",
          className,
        )}
        onCloseAutoFocus={focus.onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          focus.onOpenAutoFocus(event);
          event.preventDefault();
          if (event.target instanceof HTMLElement) {
            event.target
              .querySelector<HTMLElement>("[data-sheet-title]")
              ?.focus();
          }
        }}
        {...props}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pt-2 [overflow-wrap:anywhere] sm:p-6 sm:pt-2">
          {children}
        </div>
        <div className="order-first flex h-12 shrink-0 items-center justify-end px-2">
          <DialogPrimitive.Close
            className={cn(
              "flex size-10 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors duration-150",
              "hover:bg-surface-hover hover:text-foreground",
              "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            )}
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Close details</span>
          </DialogPrimitive.Close>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("space-y-2 border-b border-border pb-5", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-sheet-title
      tabIndex={-1}
      className={cn(
        "text-lg font-semibold leading-7 [overflow-wrap:anywhere]",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
