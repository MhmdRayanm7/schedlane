import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { formatLocalDate, schedulingToday } from "@/shared/lib/date-time";
import styles from "./bookings.module.css";
import { BookingDetailsSheet } from "./components/booking-details-sheet";
import { BookingsDayView } from "./components/bookings-day-view";
import {
  BookingsErrorState,
  BookingsLoadingState,
} from "./components/bookings-query-states";
import { BookingsToolbar } from "./components/bookings-toolbar";
import { BookingsWeekView } from "./components/bookings-week-view";
import { CreateBookingDialog } from "./components/create-booking-dialog";
import { useBookings } from "./hooks/use-bookings";
import {
  type BookingsView,
  bookingDateRange,
  bookingRangeLabel,
  moveBookingDate,
  resolveBookingsUrlState,
  sundayStart,
} from "./lib/booking-date-range";
import type { BookingStatusFilter } from "./types";

export function BookingsPage() {
  const { currentOrganization } = useOutletContext<OrganizationAccessContext>();
  const { organizationId } = useParams<{ organizationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creationMessage, setCreationMessage] = useState("");
  const [status, setStatus] = useState<BookingStatusFilter>("confirmed");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null,
  );
  const today = schedulingToday();
  const { date, view } = resolveBookingsUrlState(
    searchParams.get("date"),
    searchParams.get("view"),
    today,
  );
  const range = bookingDateRange(date, view);
  const rangeKey = `${range.fromDate}:${range.toDate}`;
  const bookingsQuery = useBookings({
    organizationId: organizationId ?? "",
    fromDate: range.fromDate,
    toDate: range.toDate,
    status,
  });
  const dateLabel = bookingRangeLabel(date, view, today);
  const isCurrentRange =
    view === "day"
      ? formatLocalDate(date) === formatLocalDate(today)
      : formatLocalDate(sundayStart(date)) ===
        formatLocalDate(sundayStart(today));

  useEffect(() => {
    if (rangeKey) setSelectedBookingId(null);
  }, [rangeKey]);

  function updateSearch(nextDate: string, nextView: BookingsView) {
    const next = new URLSearchParams(searchParams);
    next.set("date", nextDate);
    next.set("view", nextView);
    setSearchParams(next);
  }

  const selectedBooking =
    bookingsQuery.data?.bookings.find(
      (booking) => booking.id === selectedBookingId,
    ) ?? null;

  if (!organizationId) return null;
  const isReadOnly = Boolean(
    currentOrganization.archivedAt || currentOrganization.suspendedAt,
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Bookings"
        description="View and manage your organization's appointments."
        action={
          <Button disabled={isReadOnly} onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" className={styles.smallIcon} />
            New booking
          </Button>
        }
      />
      {creationMessage ? (
        <p className={styles.creationNotice} role="status">
          {creationMessage}
        </p>
      ) : null}
      <BookingsToolbar
        date={date}
        dateLabel={dateLabel}
        isCurrentRange={isCurrentRange}
        onDateChange={(nextDate) => {
          if (nextDate) updateSearch(nextDate, view);
        }}
        onNext={() =>
          updateSearch(formatLocalDate(moveBookingDate(date, view, 1)), view)
        }
        onPrevious={() =>
          updateSearch(formatLocalDate(moveBookingDate(date, view, -1)), view)
        }
        onToday={() => updateSearch(formatLocalDate(today), view)}
        onViewChange={(nextView) =>
          updateSearch(formatLocalDate(date), nextView)
        }
        view={view}
        status={status}
        onStatusChange={setStatus}
      />
      <section aria-label={`${view === "day" ? "Day" : "Week"} bookings`}>
        {bookingsQuery.isPending ? <BookingsLoadingState /> : null}
        {bookingsQuery.isError ? (
          <BookingsErrorState retry={() => void bookingsQuery.refetch()} />
        ) : null}
        {bookingsQuery.data && view === "day" ? (
          <BookingsDayView
            bookings={bookingsQuery.data.bookings}
            emptyTitle={emptyBookingTitle(status, "day")}
            onSelectBooking={(id) => {
              setSelectedBookingId(id);
              setDetailsOpen(true);
            }}
            selectedBookingId={detailsOpen ? selectedBookingId : null}
          />
        ) : null}
        {bookingsQuery.data && view === "week" ? (
          <BookingsWeekView
            bookings={bookingsQuery.data.bookings}
            emptyTitle={emptyBookingTitle(status, "week")}
            date={date}
            onSelectBooking={(id) => {
              setSelectedBookingId(id);
              setDetailsOpen(true);
            }}
            selectedBookingId={detailsOpen ? selectedBookingId : null}
            today={today}
          />
        ) : null}
      </section>
      <BookingDetailsSheet
        key={selectedBookingId}
        open={detailsOpen && Boolean(selectedBooking)}
        booking={selectedBooking}
        isReadOnly={isReadOnly}
        onOpenChange={setDetailsOpen}
        onRescheduled={(targetDate) => {
          updateSearch(targetDate, view);
          setSelectedBookingId(null);
        }}
        organizationId={organizationId}
      />
      <CreateBookingDialog
        defaultDate={formatLocalDate(date)}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(targetDate, emailProvided) => {
          updateSearch(targetDate, view);
          setCreationMessage(
            emailProvided
              ? "Booking created. Customer confirmation will be sent by email."
              : "Booking created.",
          );
        }}
        organizationId={organizationId}
      />
    </div>
  );
}

function emptyBookingTitle(status: BookingStatusFilter, view: BookingsView) {
  const period = view === "day" ? "day" : "week";
  if (status === "all") return `No bookings for this ${period}.`;
  const label = status === "no_show" ? "no-show" : status;
  return `No ${label} bookings for this ${period}.`;
}
