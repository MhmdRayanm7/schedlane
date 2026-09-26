import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  formatBookingDate,
  formatBookingDateTime,
  formatBookingTimeRange,
  formatPriceAgorot,
} from "../lib/booking-format";
import type { ManagementBooking } from "../types";
import {
  BookingLifecycleDialog,
  type LifecycleAction,
} from "./booking-lifecycle-dialog";
import { BookingRescheduleDialog } from "./booking-reschedule-dialog";
import { BookingStatus } from "./booking-status";

type BookingDetailsSheetProps = {
  booking: ManagementBooking | null;
  open: boolean;
  isReadOnly: boolean;
  onOpenChange: (open: boolean) => void;
  onRescheduled: (date: string) => void;
  organizationId: string;
};

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-subtle-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

export function BookingDetailsSheet({
  booking,
  open,
  isReadOnly,
  onOpenChange,
  onRescheduled,
  organizationId,
}: BookingDetailsSheetProps) {
  const [dialog, setDialog] = useState<"reschedule" | LifecycleAction | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  function openDialog(next: "reschedule" | LifecycleAction) {
    setDialog(next);
    setDialogOpen(true);
  }

  const canMarkNoShow = booking
    ? new Date(booking.startAt).getTime() <= Date.now()
    : false;

  return (
    <>
      <Sheet onOpenChange={onOpenChange} open={open && !dialogOpen}>
        <SheetContent>
          {booking ? (
            <div className="flex min-h-full flex-col">
              <SheetHeader className="pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <SheetTitle className="min-w-0 flex-1">
                    {booking.guestName}
                  </SheetTitle>
                  <BookingStatus status={booking.status} />
                </div>
                <SheetDescription>
                  Reference {booking.publicReference}
                </SheetDescription>
              </SheetHeader>

              <div className="divide-y divide-border">
                <section aria-labelledby="appointment-heading" className="py-5">
                  <h2
                    className="text-sm font-semibold text-foreground"
                    id="appointment-heading"
                  >
                    Appointment
                  </h2>
                  <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4">
                    <DetailItem
                      label="Date"
                      value={formatBookingDate(booking.startAt)}
                    />
                    <DetailItem
                      label="Time"
                      value={formatBookingTimeRange(booking)}
                    />
                    <DetailItem label="Service" value={booking.serviceName} />
                    <DetailItem label="Resource" value={booking.resourceName} />
                    <DetailItem
                      label="Duration"
                      value={`${booking.durationMinutes} min${
                        booking.bufferAfterMinutes > 0
                          ? ` · + ${booking.bufferAfterMinutes} min buffer`
                          : ""
                      }`}
                    />
                    {booking.priceAgorot !== null ? (
                      <DetailItem
                        label="Price"
                        value={formatPriceAgorot(booking.priceAgorot)}
                      />
                    ) : null}
                  </dl>
                </section>

                {booking.guestPhone || booking.guestEmail ? (
                  <section aria-labelledby="contact-heading" className="py-5">
                    <h2
                      className="text-sm font-semibold text-foreground"
                      id="contact-heading"
                    >
                      Guest contact
                    </h2>
                    <dl className="mt-4 grid gap-4">
                      {booking.guestPhone ? (
                        <div>
                          <dt className="text-xs font-medium text-subtle-foreground">
                            Phone
                          </dt>
                          <dd className="mt-1 text-sm">
                            <a
                              className="text-primary underline-offset-4 hover:underline"
                              href={`tel:${booking.guestPhone}`}
                            >
                              {booking.guestPhone}
                            </a>
                          </dd>
                        </div>
                      ) : null}
                      {booking.guestEmail ? (
                        <div>
                          <dt className="text-xs font-medium text-subtle-foreground">
                            Email
                          </dt>
                          <dd className="mt-1 break-all text-sm">
                            <a
                              className="text-primary underline-offset-4 hover:underline"
                              href={`mailto:${booking.guestEmail}`}
                            >
                              {booking.guestEmail}
                            </a>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </section>
                ) : null}

                {booking.customerNote ? (
                  <section aria-labelledby="note-heading" className="py-5">
                    <h2
                      className="text-sm font-semibold text-foreground"
                      id="note-heading"
                    >
                      Customer note
                    </h2>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {booking.customerNote}
                    </p>
                  </section>
                ) : null}

                {booking.status === "cancelled" &&
                (booking.cancelledAt || booking.cancellationReason) ? (
                  <section
                    aria-labelledby="cancellation-heading"
                    className="py-5"
                  >
                    <h2
                      className="text-sm font-semibold text-foreground"
                      id="cancellation-heading"
                    >
                      Cancellation
                    </h2>
                    <dl className="mt-4 grid gap-4">
                      {booking.cancelledAt ? (
                        <DetailItem
                          label="Cancelled at"
                          value={formatBookingDateTime(booking.cancelledAt)}
                        />
                      ) : null}
                      {booking.cancellationReason ? (
                        <DetailItem
                          label="Reason"
                          value={booking.cancellationReason}
                        />
                      ) : null}
                    </dl>
                  </section>
                ) : null}
              </div>

              {!isReadOnly && booking.status !== "cancelled" ? (
                <div className="border-t border-border py-5">
                  <div className="flex flex-wrap gap-2">
                    {booking.status === "confirmed" ? (
                      <>
                        <Button onClick={() => openDialog("reschedule")}>
                          Reschedule
                        </Button>
                        {canMarkNoShow ? (
                          <Button
                            onClick={() => openDialog("mark-no-show")}
                            variant="outline"
                          >
                            Mark no-show
                          </Button>
                        ) : null}
                        <Button
                          onClick={() => openDialog("cancel")}
                          variant="destructiveOutline"
                        >
                          Cancel booking
                        </Button>
                      </>
                    ) : null}
                    {booking.status === "no_show" ? (
                      <Button
                        onClick={() => openDialog("revert-no-show")}
                        variant="outline"
                      >
                        Revert no-show
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <footer className="mt-auto border-t border-border pt-4 text-xs leading-5 text-subtle-foreground">
                <p>Created {formatBookingDateTime(booking.createdAt)}</p>
              </footer>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
      {booking && dialog === "reschedule" ? (
        <BookingRescheduleDialog
          booking={booking}
          open={open && dialogOpen}
          onBack={() => setDialogOpen(false)}
          onRescheduled={onRescheduled}
          organizationId={organizationId}
        />
      ) : null}
      {booking && dialog && dialog !== "reschedule" ? (
        <BookingLifecycleDialog
          key={dialog}
          booking={booking}
          open={open && dialogOpen}
          action={dialog}
          onClose={() => setDialogOpen(false)}
          organizationId={organizationId}
        />
      ) : null}
    </>
  );
}
