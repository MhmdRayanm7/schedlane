import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";
import styles from "./sheet.module.css";
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
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content
        className={cn(styles.content, className)}
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
        <div className={styles.scrollArea}>{children}</div>
        <div className={styles.closeArea}>
          <DialogPrimitive.Close className={styles.closeButton}>
            <X aria-hidden="true" className={styles.closeIcon} />
            <span className={styles.visuallyHidden}>Close details</span>
          </DialogPrimitive.Close>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(styles.header, className)} {...props} />;
}

function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-sheet-title
      tabIndex={-1}
      className={cn(styles.title, className)}
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
      className={cn(styles.description, className)}
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
