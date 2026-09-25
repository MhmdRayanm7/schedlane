import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { PageHeader } from "@/shared/components/page-header";
import { formatLocalDate, schedulingToday } from "@/shared/lib/date-time";
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
  const { organizationId } = useParams<{ organizationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = schedulingToday();
  const { date, view } = resolveBookingsUrlState(
    searchParams.get("date"),
    searchParams.get("view"),
    today,
  );
  const range = bookingDateRange(date, view);
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

  function updateSearch(nextDate: string, nextView: BookingsView) {
    const next = new URLSearchParams(searchParams);
    next.set("date", nextDate);
    next.set("view", nextView);
    setSearchParams(next);
  }

  const content = useMemo(() => {
    if (bookingsQuery.isPending) return <BookingsLoadingState />;
    if (bookingsQuery.isError) {
      return <BookingsErrorState retry={() => void bookingsQuery.refetch()} />;
    }

    return view === "day" ? (
      <BookingsDayView bookings={bookingsQuery.data.bookings} />
    ) : (
      <BookingsWeekView
        bookings={bookingsQuery.data.bookings}
        date={date}
        today={today}
      />
    );
  }, [bookingsQuery, date, today, view]);

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
        {content}
      </section>
    </div>
  );
}
