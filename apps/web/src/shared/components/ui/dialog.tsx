import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";
import styles from "./dialog.module.css";
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
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content
        aria-busy={busy}
        className={cn(styles.content, className)}
        {...focus}
        {...props}
      >
        <div className={styles.scrollArea}>{children}</div>
        <div className={styles.closeArea}>
          <DialogPrimitive.Close
            disabled={busy === true || busy === "true"}
            className={styles.closeButton}
          >
            <X aria-hidden="true" className={styles.closeIcon} />
            <span className={styles.visuallyHidden}>Close dialog</span>
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
    <DialogPrimitive.Title className={cn(styles.title, className)} {...props} />
  );
}

function DialogDescription({
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
};
