import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FormSaveStatus } from "@/shared/components/form-save-status";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useTransientSaveState } from "@/shared/hooks/use-transient-save-state";
import {
  useAvailabilitySettings,
  useUpdateAvailabilitySettings,
} from "../hooks/use-availability-settings";
import type { AvailabilitySettings } from "../types";
import styles from "./booking-rules.module.css";

type BookingRulesTabProps = {
  organizationId: string;
  isReadOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

export function BookingRulesTab({
  organizationId,
  isReadOnly = false,
  onDirtyChange,
}: BookingRulesTabProps) {
  const settingsQuery = useAvailabilitySettings(organizationId);
  const updateSettingsMutation = useUpdateAvailabilitySettings(organizationId);

  const [slotInterval, setSlotInterval] = useState<string>("15");
  const [minNotice, setMinNotice] = useState<string>("0");
  const [horizonDays, setHorizonDays] = useState<string>("60");
  const [cancellationCutoff, setCancellationCutoff] = useState<string>("0");
  const [publicPaused, setPublicPaused] = useState<boolean>(false);
  const [persistedSettings, setPersistedSettings] =
    useState<AvailabilitySettings | null>(null);
  const isDirtyRef = useRef(false);

  const { successState, clearSaveSuccess, showSaveSuccess } =
    useTransientSaveState({ saving: updateSettingsMutation.isPending });
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync state when server data is loaded or changes
  useEffect(() => {
    if (settingsQuery.data) {
      if (!isDirtyRef.current) {
        setSlotInterval(String(settingsQuery.data.slotIntervalMinutes));
        setMinNotice(String(settingsQuery.data.minBookingNoticeMinutes));
        setHorizonDays(String(settingsQuery.data.maxBookingHorizonDays));
        setCancellationCutoff(
          String(settingsQuery.data.cancellationCutoffMinutes),
        );
        setPublicPaused(settingsQuery.data.publicBookingPaused);
      }
      setPersistedSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const server = persistedSettings;

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
    server !== null &&
    (parsedSlot !== server.slotIntervalMinutes ||
      parsedNotice !== server.minBookingNoticeMinutes ||
      parsedHorizon !== server.maxBookingHorizonDays ||
      parsedCutoff !== server.cancellationCutoffMinutes ||
      publicPaused !== server.publicBookingPaused);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  if (settingsQuery.isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading booking rules"
        className={styles.loading}
        role="status"
      >
        <div className={`${styles.skeleton} ${styles.loadingTitle}`} />
        <div className={`${styles.skeleton} ${styles.loadingDescription}`} />
        <div className={styles.loadingFields}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={styles.loadingField}>
              <div className={`${styles.skeleton} ${styles.loadingLabel}`} />
              <div className={`${styles.skeleton} ${styles.loadingControl}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className={styles.errorState}>
        <h2 className={styles.errorTitle}>Unable to load booking rules</h2>
        <p className={styles.errorDescription}>
          We encountered an error loading your organization's availability
          settings.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => settingsQuery.refetch()}
          className={styles.retry}
        >
          <RefreshCw aria-hidden="true" className={styles.smallIcon} />
          Try again
        </Button>
      </div>
    );
  }

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
    clearSaveSuccess();

    try {
      const savedSettings = {
        slotIntervalMinutes: parsedSlot,
        minBookingNoticeMinutes: parsedNotice,
        maxBookingHorizonDays: parsedHorizon,
        cancellationCutoffMinutes: parsedCutoff,
        publicBookingPaused: publicPaused,
      };
      await updateSettingsMutation.mutateAsync(savedSettings);
      setPersistedSettings(savedSettings);
      showSaveSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update booking rules.";
      setSaveError(message);
    }
  };

  const isWritesDisabled = isReadOnly || updateSettingsMutation.isPending;

  return (
    <form onSubmit={handleSave} className={styles.form}>
      <div className={styles.header}>
        <h2 className={styles.title}>Booking rules & availability settings</h2>
        <p className={styles.description}>
          Control how customers book appointments and define notice and
          cancellation policies.
        </p>
      </div>

      <div className={styles.fields}>
        <div className={styles.rule}>
          <div>
            <label htmlFor="slot-interval" className={styles.ruleLabel}>
              Time slot interval
            </label>
            <p className={styles.ruleDescription}>
              Spacing between available start times. Supports any minute value
              from 1 to 1440.
            </p>
          </div>
          <div className={styles.ruleControl}>
            <div className={styles.inlineControl}>
              <Input
                id="slot-interval"
                type="number"
                min={1}
                max={1440}
                value={slotInterval}
                disabled={isWritesDisabled}
                onChange={(e) => {
                  clearSaveSuccess();
                  setSaveError(null);
                  setSlotInterval(e.target.value);
                }}
                className={styles.numberInput}
              />
              <span className={styles.unit}>minutes</span>
            </div>
          </div>
        </div>

        <div className={styles.rule}>
          <div>
            <label htmlFor="min-notice" className={styles.ruleLabel}>
              Minimum booking notice
            </label>
            <p className={styles.ruleDescription}>
              Prevents last-minute bookings. Appointments must be scheduled at
              least this far in advance.
            </p>
          </div>
          <div className={styles.ruleControl}>
            <div className={styles.inlineControl}>
              <Input
                id="min-notice"
                type="number"
                min={0}
                value={minNotice}
                disabled={isWritesDisabled}
                onChange={(e) => {
                  clearSaveSuccess();
                  setSaveError(null);
                  setMinNotice(e.target.value);
                }}
                className={styles.numberInput}
              />
              <span className={styles.unit}>minutes before appointment</span>
            </div>
          </div>
        </div>

        <div className={styles.rule}>
          <div>
            <label htmlFor="horizon-days" className={styles.ruleLabel}>
              Booking horizon
            </label>
            <p className={styles.ruleDescription}>
              How far in advance customers can see open slots and book
              appointments.
            </p>
          </div>
          <div className={styles.ruleControl}>
            <div className={styles.inlineControl}>
              <span className={styles.unit}>Customers can book up to</span>
              <Input
                id="horizon-days"
                type="number"
                min={0}
                value={horizonDays}
                disabled={isWritesDisabled}
                onChange={(e) => {
                  clearSaveSuccess();
                  setSaveError(null);
                  setHorizonDays(e.target.value);
                }}
                className={styles.numberInput}
              />
              <span className={styles.unit}>days ahead</span>
            </div>
          </div>
        </div>

        <div className={styles.rule}>
          <div>
            <label htmlFor="cancellation-cutoff" className={styles.ruleLabel}>
              Cancellation cutoff
            </label>
            <p className={styles.ruleDescription}>
              Deadline for customer self-cancellations before an appointment
              starts.
            </p>
          </div>
          <div className={styles.ruleControl}>
            <div className={styles.inlineControl}>
              <span className={styles.unit}>Customer cancellation closes</span>
              <Input
                id="cancellation-cutoff"
                type="number"
                min={0}
                value={cancellationCutoff}
                disabled={isWritesDisabled}
                onChange={(e) => {
                  clearSaveSuccess();
                  setSaveError(null);
                  setCancellationCutoff(e.target.value);
                }}
                className={styles.numberInput}
              />
              <span className={styles.unit}>minutes before appointment</span>
            </div>
          </div>
        </div>

        {/* Public Booking Pause Toggle */}
        <div className={styles.rule}>
          <div>
            <span className={styles.ruleLabel}>Public booking status</span>
            <p className={styles.ruleDescription}>
              Pause public self-scheduling across your booking page.
            </p>
          </div>
          <div className={styles.ruleControl}>
            <div className={styles.checkboxControl}>
              <input
                id="pause-public-booking"
                type="checkbox"
                checked={publicPaused}
                disabled={isWritesDisabled}
                aria-describedby="pause-public-booking-desc"
                onChange={(e) => {
                  clearSaveSuccess();
                  setSaveError(null);
                  setPublicPaused(e.target.checked);
                }}
                className={styles.checkbox}
              />
              <div>
                <label
                  htmlFor="pause-public-booking"
                  className={styles.checkboxLabel}
                >
                  Pause public booking
                </label>
                <p
                  id="pause-public-booking-desc"
                  className={styles.ruleDescription}
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
          <p role="alert" className={styles.error}>
            {validationError}
          </p>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.feedback}>
          {!saveError && (
            <FormSaveStatus
              dirty={isDirty}
              saving={updateSettingsMutation.isPending}
              successState={successState}
            />
          )}
          {saveError && (
            <span role="alert" className={styles.error}>
              {saveError}
            </span>
          )}
        </div>

        <Button
          type="submit"
          disabled={isWritesDisabled || !isDirty || Boolean(validationError)}
          className={styles.saveButton}
          loading={updateSettingsMutation.isPending}
          loadingLabel="Saving..."
        >
          Save booking rules
        </Button>
      </div>
    </form>
  );
}
