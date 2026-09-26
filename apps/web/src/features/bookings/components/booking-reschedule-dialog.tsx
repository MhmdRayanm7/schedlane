import { Check, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { FormSaveStatus } from "@/shared/components/form-save-status";
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
import { useUnsavedChanges } from "@/shared/unsaved-changes/unsaved-changes";
import styles from "../bookings.module.css";
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
  const isDirty =
    date !== currentDate ||
    (selectedResourceId !== null &&
      selectedResourceId !== booking.resourceId) ||
    (validSelectedStart !== null && validSelectedStart !== currentStartMinute);
  const canSubmit =
    selectedResourceId !== null &&
    validSelectedStart !== null &&
    !unchanged &&
    !mutation.isPending;
  const mutationError = rescheduleErrorMessage(mutation.error);
  const optionsError = rescheduleErrorMessage(optionsQuery.error);
  const draftId = `booking-reschedule:${booking.id}`;
  const { requestChange } = useUnsavedChanges({
    id: draftId,
    dirty: open && isDirty,
    discard: () => {
      setDate(currentDate);
      setResourceId(null);
      setChosenStart(null);
      mutation.reset();
    },
  });

  const requestClose = () => {
    requestChange(onBack, { ids: [draftId] });
  };

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
        if (!open && !mutation.isPending) requestClose();
      }}
    >
      <DialogContent
        className={styles.rescheduleDialog}
        aria-busy={mutation.isPending}
      >
        <header>
          <DialogTitle>Reschedule booking</DialogTitle>
          <DialogDescription>{booking.guestName}</DialogDescription>
        </header>

        <div className={styles.rescheduleContent}>
          <section className={styles.serviceSummary}>
            <p className={styles.summaryLabel}>Service</p>
            <p className={styles.summaryName}>{booking.serviceName}</p>
            <p className={styles.summaryMetadata}>
              {booking.durationMinutes} min
              {booking.bufferAfterMinutes > 0
                ? ` | ${booking.bufferAfterMinutes} min buffer`
                : ""}
              . Service cannot be changed.
            </p>
          </section>

          <div>
            <label className={styles.fieldLabel} htmlFor="reschedule-date">
              Date
            </label>
            <Input
              className={styles.dialogControl}
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
            <p className={styles.fieldLabel} id="resource-label">
              Resource
            </p>
            {optionsQuery.data && optionsQuery.data.resources.length === 1 ? (
              <p className={styles.resourceValue}>
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
                  className={styles.dialogControl}
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

          <fieldset disabled={mutation.isPending} className={styles.times}>
            <legend className={styles.timesLegend}>Available times</legend>
            {optionsQuery.isPending ? (
              <p
                aria-live="polite"
                className={styles.queryMessage}
                role="status"
              >
                Loading available times...
              </p>
            ) : null}
            {optionsError ? (
              <div className={styles.optionsError} role="alert">
                <p className={styles.optionsErrorText}>{optionsError}</p>
                <Button
                  className={styles.retry}
                  onClick={() => void optionsQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  <RefreshCw aria-hidden="true" className={styles.smallIcon} />
                  Retry
                </Button>
              </div>
            ) : null}
            {optionsQuery.isSuccess && optionsQuery.data.starts.length === 0 ? (
              <p className={styles.queryMessage}>
                No available times for this date.
              </p>
            ) : null}
            {optionsQuery.isSuccess && optionsQuery.data.starts.length > 0 ? (
              <div className={styles.timeSlots}>
                {optionsQuery.data.starts.map((start) => {
                  const selected = validSelectedStart === start;
                  return (
                    <button
                      aria-pressed={selected}
                      className={styles.timeSlot}
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
                          styles.smallIcon,
                          !selected && styles.checkHidden,
                        )}
                      />
                      {formatMinuteOfDay(start)}
                      {selected ? (
                        <span className={styles.visuallyHidden}> selected</span>
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

        <footer className={styles.dialogFooter}>
          <div className={styles.dialogSaveStatus}>
            <FormSaveStatus
              dirty={isDirty}
              saving={mutation.isPending}
              successState="hidden"
            />
          </div>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={requestClose}
          >
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            loadingLabel="Saving..."
            disabled={!canSubmit}
            onClick={() => void save()}
          >
            Save changes
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
