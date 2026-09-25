import { ArrowLeft, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { SheetDescription, SheetTitle } from "@/shared/components/ui/sheet";
import { formatLocalDate, schedulingToday } from "@/shared/lib/date-time";
import {
  useRescheduleBooking,
  useRescheduleOptions,
} from "../hooks/use-booking-reschedule";
import {
  bookingDateTime,
  bookingLocalDate,
  formatMinuteOfDay,
} from "../lib/booking-format";
import type { ManagementBooking } from "../types";

type BookingRescheduleFormProps = {
  booking: ManagementBooking;
  onBack: () => void;
  onRescheduled: (date: string) => void;
  organizationId: string;
};

const errorMessages: Record<string, string> = {
  SLOT_UNAVAILABLE:
    "That time is no longer available. Choose another available time.",
  RESCHEDULE_START_IN_PAST: "Choose a time that has not already passed.",
  RESOURCE_INACTIVE: "That resource is no longer active. Choose another one.",
  SERVICE_NOT_ASSIGNED: "This service is no longer assigned to that resource.",
  INVALID_BOOKING_STATUS:
    "This booking changed and can no longer be rescheduled.",
  ORGANIZATION_ARCHIVED:
    "Restore the organization before changing this booking.",
  ORGANIZATION_SUSPENDED:
    "This organization is suspended and currently read-only.",
};

function rescheduleErrorMessage(error: Error | null) {
  if (error instanceof ApiError)
    return errorMessages[error.code] ?? "Something went wrong. Try again.";
  return error ? "Something went wrong. Try again." : null;
}

export function BookingRescheduleForm({
  booking,
  onBack,
  onRescheduled,
  organizationId,
}: BookingRescheduleFormProps) {
  const currentDate = bookingLocalDate(booking);
  const currentDateTime = bookingDateTime(booking.startAt);
  const currentStartMinute = currentDateTime.hour * 60 + currentDateTime.minute;
  const [date, setDate] = useState(currentDate);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [chosenStart, setChosenStart] = useState<number | null>(null);
  const optionsQuery = useRescheduleOptions({
    bookingId: booking.id,
    date,
    enabled: true,
    organizationId,
    resourceId,
  });
  const mutation = useRescheduleBooking(organizationId);
  const selectedResourceId =
    resourceId ?? optionsQuery.data?.selectedResourceId ?? null;
  const defaultCurrentStart =
    selectedResourceId === booking.resourceId && date === currentDate
      ? currentStartMinute
      : null;
  const selectedStart = chosenStart ?? defaultCurrentStart;
  const validSelectedStart =
    selectedStart !== null && optionsQuery.data?.starts.includes(selectedStart)
      ? selectedStart
      : null;
  const unchanged =
    selectedResourceId === booking.resourceId &&
    date === currentDate &&
    validSelectedStart === currentStartMinute;
  const canSubmit =
    selectedResourceId !== null &&
    validSelectedStart !== null &&
    !unchanged &&
    !mutation.isPending;
  const mutationError = rescheduleErrorMessage(mutation.error);
  const optionsError = rescheduleErrorMessage(optionsQuery.error);

  async function save() {
    if (!canSubmit || !selectedResourceId || validSelectedStart === null)
      return;
    try {
      await mutation.mutateAsync({
        organizationId,
        bookingId: booking.id,
        resourceId: selectedResourceId,
        date,
        startMinute: validSelectedStart,
      });
      onRescheduled(date);
    } catch (error) {
      if (error instanceof ApiError && error.code === "SLOT_UNAVAILABLE") {
        setChosenStart(null);
        await optionsQuery.refetch();
      }
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border px-6 pb-6 pt-6 pr-14 sm:px-7">
        <Button
          className="-ml-2 mb-4"
          onClick={onBack}
          size="sm"
          variant="ghost"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to details
        </Button>
        <SheetTitle>Reschedule booking</SheetTitle>
        <SheetDescription>
          {booking.guestName} | {booking.serviceName}
        </SheetDescription>
      </header>

      <div className="space-y-6 px-6 py-6 sm:px-7">
        <section className="rounded-lg border border-border bg-background px-4 py-3.5">
          <p className="text-xs font-medium text-subtle-foreground">Service</p>
          <p className="mt-1 text-sm font-medium">{booking.serviceName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {booking.durationMinutes} min
            {booking.bufferAfterMinutes > 0
              ? ` | ${booking.bufferAfterMinutes} min buffer`
              : ""}
            . Service cannot be changed.
          </p>
        </section>

        <div>
          <label className="text-sm font-medium" htmlFor="reschedule-date">
            Date
          </label>
          <Input
            className="mt-2"
            id="reschedule-date"
            min={formatLocalDate(schedulingToday())}
            onChange={(event) => {
              if (!event.target.value) return;
              setDate(event.target.value);
              setChosenStart(null);
              mutation.reset();
            }}
            type="date"
            value={date}
          />
        </div>

        <div>
          <p className="text-sm font-medium" id="resource-label">
            Resource
          </p>
          {optionsQuery.data && optionsQuery.data.resources.length === 1 ? (
            <p className="mt-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm">
              {optionsQuery.data.resources[0].name}
            </p>
          ) : (
            <Select
              disabled={
                !optionsQuery.data || optionsQuery.data.resources.length === 0
              }
              onValueChange={(value) => {
                setResourceId(value);
                setChosenStart(null);
                mutation.reset();
              }}
              value={selectedResourceId ?? undefined}
            >
              <SelectTrigger aria-labelledby="resource-label" className="mt-2">
                <SelectValue placeholder="Select a resource" />
              </SelectTrigger>
              <SelectContent>
                {optionsQuery.data?.resources.map((resource) => (
                  <SelectItem key={resource.id} value={resource.id}>
                    {resource.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Available times</legend>
          {optionsQuery.isPending ? (
            <p
              aria-live="polite"
              className="mt-3 text-sm text-muted-foreground"
              role="status"
            >
              Loading available times...
            </p>
          ) : null}
          {optionsError ? (
            <div
              className="mt-3 rounded-md border border-[#f0c8c4] bg-[#fff7f6] p-3"
              role="alert"
            >
              <p className="text-sm text-destructive">{optionsError}</p>
              <Button
                className="mt-2"
                onClick={() => void optionsQuery.refetch()}
                size="sm"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
                Retry
              </Button>
            </div>
          ) : null}
          {optionsQuery.isSuccess && optionsQuery.data.starts.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No available times for this date.
            </p>
          ) : null}
          {optionsQuery.isSuccess && optionsQuery.data.starts.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {optionsQuery.data.starts.map((start) => {
                const selected = validSelectedStart === start;
                return (
                  <button
                    aria-pressed={selected}
                    className={`h-9 min-w-16 rounded-md border px-3 text-sm font-medium tabular-nums outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border-strong bg-surface text-foreground hover:bg-primary-subtle"
                    }`}
                    key={start}
                    onClick={() => {
                      setChosenStart(start);
                      mutation.reset();
                    }}
                    type="button"
                  >
                    {formatMinuteOfDay(start)}
                    {selected ? (
                      <span className="sr-only"> selected</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </fieldset>

        {mutationError ? (
          <p
            className="rounded-md border border-[#f0c8c4] bg-[#fff7f6] px-3 py-2.5 text-sm text-destructive"
            role="alert"
          >
            {mutationError}
          </p>
        ) : null}
      </div>

      <footer className="mt-auto border-t border-border px-6 py-5 sm:px-7">
        {mutation.isPending ? (
          <span aria-live="polite" className="sr-only" role="status">
            Saving reschedule changes
          </span>
        ) : null}
        <Button
          className="w-full"
          disabled={!canSubmit}
          onClick={() => void save()}
        >
          {mutation.isPending ? "Saving..." : "Save changes"}
        </Button>
        {unchanged ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Choose a different resource, date, or time to save.
          </p>
        ) : null}
      </footer>
    </div>
  );
}
