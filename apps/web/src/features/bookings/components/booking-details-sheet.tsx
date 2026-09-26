import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import styles from "../bookings.module.css";
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
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={styles.detailValue}>{value}</dd>
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
            <div className={styles.details}>
              <SheetHeader className={styles.detailsHeader}>
                <div className={styles.detailsHeading}>
                  <SheetTitle className={styles.detailsTitle}>
                    {booking.guestName}
                  </SheetTitle>
                  <BookingStatus status={booking.status} />
                </div>
                <SheetDescription>
                  Reference {booking.publicReference}
                </SheetDescription>
              </SheetHeader>

              <div className={styles.detailsSections}>
                <section
                  aria-labelledby="appointment-heading"
                  className={styles.detailSection}
                >
                  <h2 className={styles.sectionTitle} id="appointment-heading">
                    Appointment
                  </h2>
                  <dl className={styles.detailGrid}>
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
                  <section
                    aria-labelledby="contact-heading"
                    className={styles.detailSection}
                  >
                    <h2 className={styles.sectionTitle} id="contact-heading">
                      Guest contact
                    </h2>
                    <dl className={styles.singleColumnGrid}>
                      {booking.guestPhone ? (
                        <div>
                          <dt className={styles.detailLabel}>Phone</dt>
                          <dd className={styles.detailValue}>
                            <a
                              className={styles.contactLink}
                              href={`tel:${booking.guestPhone}`}
                            >
                              {booking.guestPhone}
                            </a>
                          </dd>
                        </div>
                      ) : null}
                      {booking.guestEmail ? (
                        <div>
                          <dt className={styles.detailLabel}>Email</dt>
                          <dd
                            className={`${styles.detailValue} ${styles.breakAll}`}
                          >
                            <a
                              className={styles.contactLink}
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
                  <section
                    aria-labelledby="note-heading"
                    className={styles.detailSection}
                  >
                    <h2 className={styles.sectionTitle} id="note-heading">
                      Customer note
                    </h2>
                    <p className={styles.note}>{booking.customerNote}</p>
                  </section>
                ) : null}

                {booking.status === "cancelled" &&
                (booking.cancelledAt || booking.cancellationReason) ? (
                  <section
                    aria-labelledby="cancellation-heading"
                    className={styles.detailSection}
                  >
                    <h2
                      className={styles.sectionTitle}
                      id="cancellation-heading"
                    >
                      Cancellation
                    </h2>
                    <dl className={styles.singleColumnGrid}>
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
                <div className={styles.detailsActions}>
                  <div className={styles.buttonGroup}>
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

              <footer className={styles.detailsFooter}>
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
