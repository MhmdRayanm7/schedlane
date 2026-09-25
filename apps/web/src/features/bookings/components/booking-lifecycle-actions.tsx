import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";
import { useBookingActions } from "../hooks/use-booking-actions";
import { bookingActionErrorMessage } from "../lib/booking-action-errors";
import {
  formatBookingDate,
  formatBookingTimeRange,
} from "../lib/booking-format";
import type { ManagementBooking } from "../types";

type LifecycleAction = "cancel" | "mark-no-show" | "revert-no-show";

type BookingLifecycleActionsProps = {
  booking: ManagementBooking;
  organizationId: string;
};

export function BookingLifecycleActions({
  booking,
  organizationId,
}: BookingLifecycleActionsProps) {
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [reason, setReason] = useState("");
  const mutations = useBookingActions(organizationId);
  const activeMutation =
    action === "cancel"
      ? mutations.cancel
      : action === "mark-no-show"
        ? mutations.markNoShow
        : mutations.revertNoShow;
  const canMarkNoShow = new Date(booking.startAt).getTime() <= Date.now();

  function openAction(nextAction: LifecycleAction) {
    mutations.cancel.reset();
    mutations.markNoShow.reset();
    mutations.revertNoShow.reset();
    setReason("");
    setAction(nextAction);
  }

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
      setAction(null);
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
    <>
      <div className="flex flex-wrap gap-2">
        {booking.status === "confirmed" ? (
          <>
            {canMarkNoShow ? (
              <Button
                onClick={() => openAction("mark-no-show")}
                variant="outline"
              >
                Mark no-show
              </Button>
            ) : null}
            <Button
              onClick={() => openAction("cancel")}
              variant="destructiveOutline"
            >
              Cancel booking
            </Button>
          </>
        ) : null}
        {booking.status === "no_show" ? (
          <Button
            onClick={() => openAction("revert-no-show")}
            variant="outline"
          >
            Revert no-show
          </Button>
        ) : null}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !activeMutation.isPending) setAction(null);
        }}
        open={action !== null}
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
            <label
              className="mt-5 block text-sm font-medium"
              htmlFor="cancellation-reason"
            >
              Cancellation reason{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
              <Textarea
                className="mt-2"
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
            <p
              className="mt-4 rounded-md border border-[#f0c8c4] bg-[#fff7f6] px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <Button
              disabled={activeMutation.isPending}
              onClick={() => setAction(null)}
              variant="ghost"
            >
              Keep booking
            </Button>
            <Button
              disabled={activeMutation.isPending}
              onClick={() => void submit()}
              variant={action === "cancel" ? "destructive" : "default"}
            >
              {activeMutation.isPending ? "Saving..." : submitLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
