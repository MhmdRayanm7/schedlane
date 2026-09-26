import { Check, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/cn";
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

type BookingRescheduleDialogProps = {
  booking: ManagementBooking;
  open: boolean;
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

export function BookingRescheduleDialog({
  booking,
  open,
  onBack,
  onRescheduled,
  organizationId,
}: BookingRescheduleDialogProps) {
  const currentDate = bookingLocalDate(booking);
  const currentDateTime = bookingDateTime(booking.startAt);
  const currentStartMinute = currentDateTime.hour * 60 + currentDateTime.minute;
  const [date, setDate] = useState(currentDate);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [chosenStart, setChosenStart] = useState<number | null>(null);
  const optionsQuery = useRescheduleOptions({
    bookingId: booking.id,
    date,
    enabled: open,
    organizationId,
    resourceId,
  });
  const mutation = useRescheduleBooking(organizationId);
  const resetMutation = mutation.reset;

  useEffect(() => {
    if (!open) return;
    setDate(currentDate);
    setResourceId(null);
    setChosenStart(null);
    resetMutation();
  }, [open, currentDate, resetMutation]);

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
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onBack();
      }}
    >
      <DialogContent className="max-w-[560px]" aria-busy={mutation.isPending}>
        <header>
          <DialogTitle>Reschedule booking</DialogTitle>
          <DialogDescription>{booking.guestName}</DialogDescription>
        </header>

        <div className="space-y-4 py-5">
          <section className="border-y border-border py-3">
            <p className="text-xs font-medium text-subtle-foreground">
              Service
            </p>
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
              className="mt-1.5"
              disabled={mutation.isPending}
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
                  mutation.isPending ||
                  !optionsQuery.data ||
                  optionsQuery.data.resources.length === 0
                }
                onValueChange={(value) => {
                  setResourceId(value);
                  setChosenStart(null);
                  mutation.reset();
                }}
                value={selectedResourceId ?? undefined}
              >
                <SelectTrigger
                  aria-labelledby="resource-label"
                  className="mt-2"
                >
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

          <fieldset disabled={mutation.isPending} className="min-w-0">
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
                className="mt-3 rounded-md border border-destructive/25 bg-destructive-subtle p-3"
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
              <div className="mt-3 grid max-h-60 grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 overflow-y-auto overscroll-contain p-1">
                {optionsQuery.data.starts.map((start) => {
                  const selected = validSelectedStart === start;
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn(
                        "inline-flex h-10 items-center justify-center gap-1 rounded-md border px-2",
                        "text-sm font-medium tabular-nums",
                        "outline-none transition-colors duration-150",
                        "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-strong bg-surface text-foreground hover:border-muted-foreground hover:bg-surface-hover",
                      )}
                      key={start}
                      onClick={() => {
                        setChosenStart(start);
                        mutation.reset();
                      }}
                      type="button"
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(
                          "size-3.5 shrink-0",
                          !selected && "invisible",
                        )}
                      />
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
            <InlineAlert as="p" variant="error">
              {mutationError}
            </InlineAlert>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {mutation.isPending ? (
            <span aria-live="polite" className="sr-only" role="status">
              Saving reschedule changes
            </span>
          ) : null}
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={onBack}
          >
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!canSubmit}
            onClick={() => void save()}
          >
            Save changes
          </Button>
          {unchanged ? (
            <p className="w-full text-right text-xs text-muted-foreground">
              Choose a different resource, date, or time to save.
            </p>
          ) : null}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
