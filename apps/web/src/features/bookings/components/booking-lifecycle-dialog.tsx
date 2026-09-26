import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Textarea } from "@/shared/components/ui/textarea";
import styles from "../bookings.module.css";
import { useBookingActions } from "../hooks/use-booking-actions";
import { bookingActionErrorMessage } from "../lib/booking-action-errors";
import {
  formatBookingDate,
  formatBookingTimeRange,
} from "../lib/booking-format";
import type { ManagementBooking } from "../types";

export type LifecycleAction = "cancel" | "mark-no-show" | "revert-no-show";

type BookingLifecycleDialogProps = {
  booking: ManagementBooking;
  open: boolean;
  action: LifecycleAction;
  onClose: () => void;
  organizationId: string;
};

export function BookingLifecycleDialog({
  booking,
  open,
  action,
  onClose,
  organizationId,
}: BookingLifecycleDialogProps) {
  const [reason, setReason] = useState("");
  const mutations = useBookingActions(organizationId);
  const activeMutation =
    action === "cancel"
      ? mutations.cancel
      : action === "mark-no-show"
        ? mutations.markNoShow
        : mutations.revertNoShow;
  const resetMutation = activeMutation.reset;

  useEffect(() => {
    if (!open) return;
    setReason("");
    resetMutation();
  }, [open, resetMutation]);

  async function submit() {
    try {
      if (action === "cancel") {
        await mutations.cancel.mutateAsync({
          organizationId,
          bookingId: booking.id,
          reason: reason.trim() || null,
        });
      } else if (action === "mark-no-show") {
        await mutations.markNoShow.mutateAsync({
          organizationId,
          bookingId: booking.id,
        });
      } else if (action === "revert-no-show") {
        await mutations.revertNoShow.mutateAsync({
          organizationId,
          bookingId: booking.id,
        });
      }
      onClose();
    } catch {
      // The mutation owns the inline error state and keeps this dialog stable.
    }
  }

  const title =
    action === "cancel"
      ? "Cancel booking?"
      : action === "mark-no-show"
        ? "Mark as no-show?"
        : "Revert no-show?";
  const description =
    action === "cancel"
      ? `${booking.guestName} | ${formatBookingDate(booking.startAt)} | ${formatBookingTimeRange(booking)} | ${booking.serviceName}`
      : action === "mark-no-show"
        ? "This records that the customer did not arrive for the appointment."
        : "This returns the booking to Confirmed and restores its occupied time.";
  const submitLabel =
    action === "cancel"
      ? "Cancel booking"
      : action === "mark-no-show"
        ? "Mark no-show"
        : "Revert no-show";
  const errorMessage = bookingActionErrorMessage(activeMutation.error);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !activeMutation.isPending) onClose();
      }}
      open={open}
    >
      <DialogContent
        aria-busy={activeMutation.isPending}
        onEscapeKeyDown={(event) => {
          if (activeMutation.isPending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (activeMutation.isPending) event.preventDefault();
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>

        {action === "cancel" ? (
          <label className={styles.dialogField} htmlFor="cancellation-reason">
            Cancellation reason{" "}
            <span className={styles.optional}>(optional)</span>
            <Textarea
              className={styles.dialogControl}
              disabled={activeMutation.isPending}
              id="cancellation-reason"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Add a note for your team"
              value={reason}
            />
          </label>
        ) : null}

        {errorMessage ? (
          <InlineAlert as="p" variant="error" className={styles.dialogAlert}>
            {errorMessage}
          </InlineAlert>
        ) : null}

        <div className={styles.dialogActions}>
          <Button
            disabled={activeMutation.isPending}
            onClick={() => onClose()}
            variant="ghost"
          >
            Keep booking
          </Button>
          <Button
            loading={activeMutation.isPending}
            disabled={activeMutation.isPending}
            onClick={() => void submit()}
            variant={action === "cancel" ? "destructive" : "default"}
          >
            {submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
