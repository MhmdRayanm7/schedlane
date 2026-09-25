import { useEffect, useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import { PageHeader } from "@/shared/components/page-header";
import { formatLocalDate, schedulingToday } from "@/shared/lib/date-time";
import { BookingDetailsSheet } from "./components/booking-details-sheet";
import { BookingsDayView } from "./components/bookings-day-view";
import {
  BookingsErrorState,
  BookingsLoadingState,
} from "./components/bookings-query-states";
import { BookingsToolbar } from "./components/bookings-toolbar";
import { BookingsWeekView } from "./components/bookings-week-view";
import { useBookings } from "./hooks/use-bookings";
import {
  type BookingsView,
  bookingDateRange,
  bookingRangeLabel,
  moveBookingDate,
  resolveBookingsUrlState,
  sundayStart,
} from "./lib/booking-date-range";

export function BookingsPage() {
  const { currentOrganization } = useOutletContext<OrganizationAccessContext>();
  const { organizationId } = useParams<{ organizationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
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

  return (
    <div className="relative">
      <PageHeader
        title="Bookings"
        description="View and manage your organization's appointments."
      />
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
      />
      <section aria-label={`${view === "day" ? "Day" : "Week"} bookings`}>
        {bookingsQuery.isPending ? <BookingsLoadingState /> : null}
        {bookingsQuery.isError ? (
          <BookingsErrorState retry={() => void bookingsQuery.refetch()} />
        ) : null}
        {bookingsQuery.isSuccess && view === "day" ? (
          <BookingsDayView
            bookings={bookingsQuery.data.bookings}
            onSelectBooking={setSelectedBookingId}
            selectedBookingId={selectedBookingId}
          />
        ) : null}
        {bookingsQuery.isSuccess && view === "week" ? (
          <BookingsWeekView
            bookings={bookingsQuery.data.bookings}
            date={date}
            onSelectBooking={setSelectedBookingId}
            selectedBookingId={selectedBookingId}
            today={today}
          />
        ) : null}
      </section>
      <BookingDetailsSheet
        booking={selectedBooking}
        isReadOnly={Boolean(
          currentOrganization.archivedAt || currentOrganization.suspendedAt,
        )}
        onOpenChange={(open) => {
          if (!open) setSelectedBookingId(null);
        }}
        onRescheduled={(targetDate) => {
          updateSearch(targetDate, view);
          setSelectedBookingId(null);
        }}
        organizationId={organizationId}
      />
    </div>
  );
}
