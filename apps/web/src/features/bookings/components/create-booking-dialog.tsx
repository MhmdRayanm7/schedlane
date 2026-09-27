import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { FormField } from "@/shared/components/ui/form-field";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/cn";
import { schedulingToday } from "@/shared/lib/date-time";
import { useUnsavedChanges } from "@/shared/unsaved-changes/unsaved-changes";
import styles from "../bookings.module.css";
import {
  useCreateManualBooking,
  useManualBookingContext,
  useManualBookingOptions,
} from "../hooks/use-manual-booking";
import { formatMinuteOfDay } from "../lib/booking-format";

type CreateBookingDialogProps = {
  defaultDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (date: string, emailProvided: boolean) => void;
  organizationId: string;
};

const creationErrors: Record<string, string> = {
  SLOT_UNAVAILABLE: "That time is no longer available. Choose another time.",
  BOOKING_START_IN_PAST: "Choose a time that has not already passed.",
  INVALID_GUEST_NAME: "Enter a valid customer name or leave it blank.",
  INVALID_GUEST_PHONE: "Enter a valid Israeli phone number or leave it blank.",
  RESOURCE_INACTIVE: "That resource is no longer active.",
  SERVICE_INACTIVE: "That service is no longer active.",
  SERVICE_NOT_ASSIGNED: "That service is no longer assigned to this resource.",
  ORGANIZATION_ARCHIVED: "Restore the organization before creating bookings.",
  ORGANIZATION_SUSPENDED:
    "This organization is suspended and currently read-only.",
};

function featureError(error: Error | null, fallback: string) {
  if (error instanceof ApiError) return creationErrors[error.code] ?? fallback;
  return error ? fallback : null;
}

export function CreateBookingDialog({
  defaultDate,
  open,
  onOpenChange,
  onCreated,
  organizationId,
}: CreateBookingDialogProps) {
  const today = schedulingToday().toFormat("yyyy-MM-dd");
  const initialDate = defaultDate < today ? today : defaultDate;
  const [resourceId, setResourceId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startMinute, setStartMinute] = useState<number | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const contextQuery = useManualBookingContext(organizationId, open);
  const selectedResource = useMemo(
    () =>
      contextQuery.data?.resources.find(
        (resource) => resource.id === resourceId,
      ),
    [contextQuery.data, resourceId],
  );
  const optionsQuery = useManualBookingOptions({
    organizationId,
    resourceId,
    serviceId,
    date,
    enabled: open,
  });
  const createMutation = useCreateManualBooking(organizationId);

  useEffect(() => {
    if (!open) return;
    setResourceId("");
    setServiceId("");
    setDate(initialDate);
    setStartMinute(null);
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setCustomerNote("");
    createMutation.reset();
  }, [open, initialDate, createMutation.reset]);

  useEffect(() => {
    if (!open || resourceId || !contextQuery.data) return;
    if (
      contextQuery.data.role === "staff" ||
      contextQuery.data.resources.length === 1
    ) {
      setResourceId(contextQuery.data.resources[0]?.id ?? "");
    }
  }, [open, resourceId, contextQuery.data]);

  useEffect(() => {
    if (!open || !resourceId || !contextQuery.data) return;
    const currentResource = contextQuery.data.resources.find(
      (resource) => resource.id === resourceId,
    );
    if (!currentResource) {
      setResourceId("");
      setServiceId("");
      setStartMinute(null);
      createMutation.reset();
      return;
    }
    if (
      serviceId &&
      !currentResource.services.some((service) => service.id === serviceId)
    ) {
      setServiceId("");
      setStartMinute(null);
      createMutation.reset();
    }
  }, [open, resourceId, serviceId, contextQuery.data, createMutation.reset]);

  const dirty = Boolean(
    ((contextQuery.data?.resources.length ?? 0) > 1 && resourceId) ||
      serviceId ||
      startMinute !== null ||
      guestName ||
      guestPhone ||
      guestEmail ||
      customerNote ||
      date !== initialDate,
  );
  const draftId = `manual-booking:${organizationId}`;
  const { requestChange } = useUnsavedChanges({
    id: draftId,
    dirty: open && dirty,
    discard: () => createMutation.reset(),
  });
  const requestClose = () =>
    requestChange(() => onOpenChange(false), { ids: [draftId] });

  const contextError = featureError(
    contextQuery.error,
    "Booking setup could not be loaded. Try again.",
  );
  const optionsError = featureError(
    optionsQuery.error,
    "Available times could not be loaded. Try again.",
  );
  const creationError = featureError(
    createMutation.error,
    "The booking could not be created. Try again.",
  );
  const canSubmit = Boolean(
    resourceId &&
      serviceId &&
      startMinute !== null &&
      !createMutation.isPending,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || startMinute === null) return;
    try {
      await createMutation.mutateAsync({
        organizationId,
        resourceId,
        serviceId,
        date,
        startMinute,
        guestName,
        guestPhone,
        guestEmail,
        customerNote,
      });
      onCreated(date, Boolean(guestEmail.trim()));
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === "SLOT_UNAVAILABLE") {
        setStartMinute(null);
        await optionsQuery.refetch();
      }
      if (
        error instanceof ApiError &&
        [
          "RESOURCE_INACTIVE",
          "SERVICE_INACTIVE",
          "SERVICE_NOT_ASSIGNED",
        ].includes(error.code)
      ) {
        setStartMinute(null);
        await contextQuery.refetch();
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !createMutation.isPending) requestClose();
      }}
    >
      <DialogContent
        className={styles.createDialog}
        aria-busy={createMutation.isPending}
      >
        <header>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            Create a confirmed appointment using the live schedule.
          </DialogDescription>
        </header>

        <form className={styles.createForm} onSubmit={submit}>
          <section
            className={styles.createSection}
            aria-labelledby="appointment-section"
          >
            <h2 className={styles.createSectionTitle} id="appointment-section">
              Appointment
            </h2>
            {contextQuery.isPending ? (
              <p className={styles.queryMessage}>Loading booking setup...</p>
            ) : null}
            {contextError ? (
              <div className={styles.optionsError} role="alert">
                <p className={styles.optionsErrorText}>{contextError}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void contextQuery.refetch()}
                >
                  <RefreshCw aria-hidden="true" className={styles.smallIcon} />
                  Try again
                </Button>
              </div>
            ) : null}
            {contextQuery.data?.resources.length === 0 ? (
              <InlineAlert as="p" variant="warning">
                {contextQuery.data.role === "staff"
                  ? "You need a linked active resource before you can create bookings."
                  : "Add an active resource before creating a booking."}
              </InlineAlert>
            ) : null}

            {contextQuery.data && contextQuery.data.resources.length > 0 ? (
              <div className={styles.createGrid}>
                <FormField htmlFor="manual-resource" label="Resource">
                  {contextQuery.data.role === "staff" &&
                  contextQuery.data.resources.length === 1 ? (
                    <p className={styles.resourceValue} id="manual-resource">
                      {contextQuery.data.resources[0]?.name}
                    </p>
                  ) : (
                    <Select
                      value={resourceId || undefined}
                      disabled={createMutation.isPending}
                      onValueChange={(value) => {
                        setResourceId(value);
                        setServiceId("");
                        setStartMinute(null);
                        createMutation.reset();
                      }}
                    >
                      <SelectTrigger id="manual-resource">
                        <SelectValue placeholder="Select a resource" />
                      </SelectTrigger>
                      <SelectContent>
                        {contextQuery.data.resources.map((resource) => (
                          <SelectItem key={resource.id} value={resource.id}>
                            {resource.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>

                <FormField htmlFor="manual-service" label="Service">
                  <Select
                    value={serviceId || undefined}
                    disabled={!selectedResource || createMutation.isPending}
                    onValueChange={(value) => {
                      setServiceId(value);
                      setStartMinute(null);
                      createMutation.reset();
                    }}
                  >
                    <SelectTrigger id="manual-service">
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedResource?.services.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} · {service.durationMinutes} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedResource &&
                  selectedResource.services.length === 0 ? (
                    <p className={styles.queryMessage}>
                      No active services are assigned to this resource.
                    </p>
                  ) : null}
                </FormField>

                <FormField htmlFor="manual-date" label="Date">
                  <Input
                    id="manual-date"
                    type="date"
                    min={today}
                    value={date}
                    disabled={createMutation.isPending}
                    onChange={(event) => {
                      if (!event.target.value) return;
                      setDate(event.target.value);
                      setStartMinute(null);
                      createMutation.reset();
                    }}
                  />
                </FormField>
              </div>
            ) : null}

            {resourceId && serviceId ? (
              <fieldset
                className={styles.times}
                disabled={createMutation.isPending}
              >
                <legend className={styles.timesLegend}>Time</legend>
                {optionsQuery.isPending ? (
                  <p className={styles.queryMessage}>Loading availability...</p>
                ) : null}
                {optionsError ? (
                  <div className={styles.optionsError} role="alert">
                    <p className={styles.optionsErrorText}>{optionsError}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void optionsQuery.refetch()}
                    >
                      <RefreshCw
                        aria-hidden="true"
                        className={styles.smallIcon}
                      />
                      Try again
                    </Button>
                  </div>
                ) : null}
                {optionsQuery.isSuccess &&
                optionsQuery.data.starts.length === 0 ? (
                  <p className={styles.queryMessage}>
                    No times available for this date.
                  </p>
                ) : null}
                {optionsQuery.data && optionsQuery.data.starts.length > 0 ? (
                  <div className={styles.timeSlots}>
                    {optionsQuery.data.starts.map((start) => {
                      const selected = startMinute === start;
                      return (
                        <button
                          aria-pressed={selected}
                          className={styles.timeSlot}
                          key={start}
                          type="button"
                          onClick={() => {
                            setStartMinute(start);
                            createMutation.reset();
                          }}
                        >
                          <Check
                            aria-hidden="true"
                            className={cn(
                              styles.smallIcon,
                              !selected && styles.checkHidden,
                            )}
                          />
                          {formatMinuteOfDay(start)}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </fieldset>
            ) : null}
          </section>

          <section
            className={styles.createSection}
            aria-labelledby="customer-section"
          >
            <h2 className={styles.createSectionTitle} id="customer-section">
              Customer <span className={styles.optional}>Optional</span>
            </h2>
            <p className={styles.createSectionDescription}>
              Add contact details if you want the customer to receive booking
              updates.
            </p>
            <div className={styles.createGrid}>
              <FormField htmlFor="manual-name" label="Name (optional)">
                <Input
                  id="manual-name"
                  value={guestName}
                  maxLength={120}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </FormField>
              <FormField htmlFor="manual-phone" label="Phone (optional)">
                <Input
                  id="manual-phone"
                  value={guestPhone}
                  inputMode="tel"
                  onChange={(event) => setGuestPhone(event.target.value)}
                />
              </FormField>
              <FormField
                htmlFor="manual-email"
                label="Email (optional)"
                helperText="Confirmation and booking updates will be sent here."
              >
                <Input
                  id="manual-email"
                  value={guestEmail}
                  type="email"
                  onChange={(event) => setGuestEmail(event.target.value)}
                />
              </FormField>
              <FormField htmlFor="manual-note" label="Note (optional)">
                <Textarea
                  id="manual-note"
                  value={customerNote}
                  maxLength={1000}
                  onChange={(event) => setCustomerNote(event.target.value)}
                />
              </FormField>
            </div>
          </section>

          {creationError ? (
            <InlineAlert as="p" variant="error">
              {creationError}
            </InlineAlert>
          ) : null}

          <footer className={styles.dialogFooter}>
            <Button
              type="button"
              variant="outline"
              disabled={createMutation.isPending}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              loading={createMutation.isPending}
              loadingLabel="Creating..."
            >
              Create booking
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
