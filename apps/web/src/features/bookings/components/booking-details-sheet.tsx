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
import { BookingStatus } from "./booking-status";

type BookingDetailsSheetProps = {
  booking: ManagementBooking | null;
  onOpenChange: (open: boolean) => void;
};

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-subtle-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function BookingDetailsSheet({
  booking,
  onOpenChange,
}: BookingDetailsSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(booking)}>
      <SheetContent>
        {booking ? (
          <div className="flex min-h-full flex-col">
            <SheetHeader className="border-b border-border px-6 pb-6 pt-7 pr-14 sm:px-7 sm:pt-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SheetTitle>{booking.guestName}</SheetTitle>
                <BookingStatus status={booking.status} />
              </div>
              <SheetDescription>
                Reference {booking.publicReference}
              </SheetDescription>
            </SheetHeader>

            <div className="divide-y divide-border px-6 sm:px-7">
              <section aria-labelledby="appointment-heading" className="py-6">
                <h2
                  className="text-sm font-semibold text-foreground"
                  id="appointment-heading"
                >
                  Appointment
                </h2>
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-5">
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
                <section aria-labelledby="contact-heading" className="py-6">
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
                <section aria-labelledby="note-heading" className="py-6">
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
                  className="py-6"
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

            <footer className="mt-auto border-t border-border px-6 py-5 text-xs leading-5 text-subtle-foreground sm:px-7">
              <p>Reference {booking.publicReference}</p>
              <p>Created {formatBookingDateTime(booking.createdAt)}</p>
            </footer>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
