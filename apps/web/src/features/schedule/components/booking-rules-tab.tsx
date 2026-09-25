import { Check, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  useAvailabilitySettings,
  useUpdateAvailabilitySettings,
} from "../hooks/use-availability-settings";
import type { AvailabilitySettings } from "../types";

type BookingRulesTabProps = {
  organizationId: string;
  isReadOnly?: boolean;
};

export function BookingRulesTab({
  organizationId,
  isReadOnly = false,
}: BookingRulesTabProps) {
  const settingsQuery = useAvailabilitySettings(organizationId);
  const updateSettingsMutation = useUpdateAvailabilitySettings(organizationId);

  const [slotInterval, setSlotInterval] = useState<string>("15");
  const [minNotice, setMinNotice] = useState<string>("0");
  const [horizonDays, setHorizonDays] = useState<string>("60");
  const [cancellationCutoff, setCancellationCutoff] = useState<string>("0");
  const [publicPaused, setPublicPaused] = useState<boolean>(false);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync state when server data is loaded or changes
  useEffect(() => {
    if (settingsQuery.data) {
      setSlotInterval(String(settingsQuery.data.slotIntervalMinutes));
      setMinNotice(String(settingsQuery.data.minBookingNoticeMinutes));
      setHorizonDays(String(settingsQuery.data.maxBookingHorizonDays));
      setCancellationCutoff(
        String(settingsQuery.data.cancellationCutoffMinutes),
      );
      setPublicPaused(settingsQuery.data.publicBookingPaused);
    }
  }, [settingsQuery.data]);

  if (settingsQuery.isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading booking rules"
        className="space-y-4 rounded-lg border border-border bg-surface p-6"
        role="status"
      >
        <div className="h-5 w-48 rounded bg-border animate-pulse" />
        <div className="h-4 w-72 rounded bg-border-subtle animate-pulse" />
        <div className="space-y-6 pt-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 rounded bg-border animate-pulse" />
              <div className="h-9 w-40 rounded bg-border animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <h2 className="text-base font-semibold text-foreground">
          Unable to load booking rules
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We encountered an error loading your organization's availability
          settings.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => settingsQuery.refetch()}
          className="mt-4"
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  const server = settingsQuery.data as AvailabilitySettings;

  const parsedSlot = Number.parseInt(slotInterval, 10);
  const parsedNotice = Number.parseInt(minNotice, 10);
  const parsedHorizon = Number.parseInt(horizonDays, 10);
  const parsedCutoff = Number.parseInt(cancellationCutoff, 10);

  let validationError: string | null = null;
  if (Number.isNaN(parsedSlot) || parsedSlot < 1 || parsedSlot > 1440) {
    validationError =
      "Time slot interval must be an integer between 1 and 1440 minutes.";
  } else if (Number.isNaN(parsedNotice) || parsedNotice < 0) {
    validationError = "Minimum booking notice must be a non-negative integer.";
  } else if (Number.isNaN(parsedHorizon) || parsedHorizon < 0) {
    validationError = "Booking horizon must be a non-negative integer.";
  } else if (Number.isNaN(parsedCutoff) || parsedCutoff < 0) {
    validationError = "Cancellation cutoff must be a non-negative integer.";
  }

  const isDirty =
    Boolean(server) &&
    (parsedSlot !== server.slotIntervalMinutes ||
      parsedNotice !== server.minBookingNoticeMinutes ||
      parsedHorizon !== server.maxBookingHorizonDays ||
      parsedCutoff !== server.cancellationCutoffMinutes ||
      publicPaused !== server.publicBookingPaused);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      isReadOnly ||
      updateSettingsMutation.isPending ||
      !isDirty ||
      validationError
    ) {
      return;
    }

    setSaveError(null);
    setSaveSuccess(false);

    try {
      await updateSettingsMutation.mutateAsync({
        slotIntervalMinutes: parsedSlot,
        minBookingNoticeMinutes: parsedNotice,
        maxBookingHorizonDays: parsedHorizon,
        cancellationCutoffMinutes: parsedCutoff,
        publicBookingPaused: publicPaused,
      });
      setSaveSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update booking rules.";
      setSaveError(message);
    }
  };

  const isWritesDisabled = isReadOnly || updateSettingsMutation.isPending;

  return (
    <form
      onSubmit={handleSave}
      className="rounded-lg border border-border bg-surface"
    >
      <div className="border-b border-border p-4 sm:px-6">
        <h2 className="text-base font-semibold text-foreground">
          Booking rules & availability settings
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Control how customers book appointments and define notice and
          cancellation policies.
        </p>
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        {/* Slot Interval */}
        <div className="grid gap-2 sm:grid-cols-3 sm:items-start">
          <div>
            <label
              htmlFor="slot-interval"
              className="text-sm font-medium text-foreground"
            >
              Time slot interval
            </label>
            <p className="text-xs text-muted-foreground">
              Spacing between available start times. Supports any minute value
              from 1 to 1440.
            </p>
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <Input
                id="slot-interval"
                type="number"
                min={1}
                max={1440}
                value={slotInterval}
                disabled={isWritesDisabled}
                onChange={(e) => {
                  setSaveSuccess(false);
                  setSlotInterval(e.target.value);
                }}
                className="h-9 w-24 text-xs font-mono"
              />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          </div>
        </div>

        {/* Minimum Booking Notice */}
        <div className="grid gap-2 border-t border-border pt-6 sm:grid-cols-3 sm:items-start">
          <div>
            <label
              htmlFor="min-notice"
              className="text-sm font-medium text-foreground"
            >
              Minimum booking notice
            </label>
            <p className="text-xs text-muted-foreground">
              Prevents last-minute bookings. Appointments must be scheduled at
              least this far in advance.
            </p>
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <Input
                id="min-notice"
                type="number"
                min={0}
                value={minNotice}
                disabled={isWritesDisabled}
                onChange={(e) => {
                  setSaveSuccess(false);
                  setMinNotice(e.target.value);
                }}
                className="h-9 w-24 text-xs font-mono"
              />
              <span className="text-xs text-muted-foreground">
                minutes before appointment
              </span>
            </div>
          </div>
        </div>

        {/* Booking Horizon */}
        <div className="grid gap-2 border-t border-border pt-6 sm:grid-cols-3 sm:items-start">
          <div>
            <label
              htmlFor="horizon-days"
              className="text-sm font-medium text-foreground"
            >
              Booking horizon
            </label>
            <p className="text-xs text-muted-foreground">
              How far in advance customers can see open slots and book
              appointments.
            </p>
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Customers can book up to
              </span>
              <Input
                id="horizon-days"
                type="number"
                min={0}
                value={horizonDays}
                disabled={isWritesDisabled}
                onChange={(e) => {
                  setSaveSuccess(false);
                  setHorizonDays(e.target.value);
                }}
                className="h-9 w-24 text-xs font-mono"
              />
              <span className="text-xs text-muted-foreground">days ahead</span>
            </div>
          </div>
        </div>

        {/* Cancellation Cutoff */}
        <div className="grid gap-2 border-t border-border pt-6 sm:grid-cols-3 sm:items-start">
          <div>
            <label
              htmlFor="cancellation-cutoff"
              className="text-sm font-medium text-foreground"
            >
              Cancellation cutoff
            </label>
            <p className="text-xs text-muted-foreground">
              Deadline for customer self-cancellations before an appointment
              starts.
            </p>
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Customer cancellation closes
              </span>
              <Input
                id="cancellation-cutoff"
                type="number"
                min={0}
                value={cancellationCutoff}
                disabled={isWritesDisabled}
                onChange={(e) => {
                  setSaveSuccess(false);
                  setCancellationCutoff(e.target.value);
                }}
                className="h-9 w-24 text-xs font-mono"
              />
              <span className="text-xs text-muted-foreground">
                minutes before appointment
              </span>
            </div>
          </div>
        </div>

        {/* Public Booking Pause Toggle */}
        <div className="grid gap-2 border-t border-border pt-6 sm:grid-cols-3 sm:items-start">
          <div>
            <span className="text-sm font-medium text-foreground">
              Public booking status
            </span>
            <p className="text-xs text-muted-foreground">
              Pause public self-scheduling across your booking page.
            </p>
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-start gap-3">
              <input
                id="pause-public-booking"
                type="checkbox"
                checked={publicPaused}
                disabled={isWritesDisabled}
                aria-describedby="pause-public-booking-desc"
                onChange={(e) => {
                  setSaveSuccess(false);
                  setPublicPaused(e.target.checked);
                }}
                className="mt-0.5 size-4 rounded border-border-strong text-primary focus:ring-primary"
              />
              <div>
                <label
                  htmlFor="pause-public-booking"
                  className="text-sm font-medium text-foreground cursor-pointer"
                >
                  Pause public booking
                </label>
                <p
                  id="pause-public-booking-desc"
                  className="text-xs text-muted-foreground"
                >
                  When paused, the public booking flow will show that scheduling
                  is unavailable. Existing bookings remain intact and staff can
                  still manage the schedule.
                </p>
              </div>
            </div>
          </div>
        </div>

        {validationError && (
          <p role="alert" className="text-xs font-medium text-danger">
            {validationError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 sm:px-6">
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
            >
              <Check aria-hidden="true" className="size-3.5" />
              Saved booking rules
            </span>
          )}
          {saveError && (
            <span role="alert" className="text-xs font-medium text-danger">
              {saveError}
            </span>
          )}
        </div>

        <Button
          type="submit"
          disabled={isWritesDisabled || !isDirty || Boolean(validationError)}
          className="text-xs"
        >
          {updateSettingsMutation.isPending ? "Saving…" : "Save booking rules"}
        </Button>
      </div>
    </form>
  );
}
