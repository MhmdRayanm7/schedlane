import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Clipboard } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { ApiError } from "@/shared/api/api-error";
import { FormSaveStatus } from "@/shared/components/form-save-status";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { FormField } from "@/shared/components/ui/form-field";
import { Input } from "@/shared/components/ui/input";
import { useUnsavedChanges } from "@/shared/unsaved-changes/unsaved-changes";
import {
  cancelManagedBooking,
  getManagedBooking,
  guestBookingKey,
  updateManagedContact,
} from "../api/public-booking-api";
import { formatDeadline, formatInstant, formatPrice } from "../lib/format";
import styles from "../public-booking.module.css";
import type { ManagedBooking } from "../types";
import { BookingState, PublicFrame } from "./public-booking-page";

function readToken() {
  if (!window.location.hash.startsWith("#token=")) return "";
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

function phoneForComparison(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
}

function EditContactDialog({
  open,
  onOpenChange,
  booking,
  token,
  onSaved,
  onUnavailable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: ManagedBooking;
  token: string;
  onSaved: (
    contact: Pick<ManagedBooking, "guestName" | "guestPhone" | "guestEmail">,
  ) => void;
  onUnavailable: (message: string) => void;
}) {
  const [name, setName] = useState(booking.guestName);
  const [phone, setPhone] = useState(booking.guestPhone ?? "");
  const [email, setEmail] = useState(booking.guestEmail ?? "");
  const [error, setError] = useState("");
  const update = useMutation({
    mutationFn: () =>
      updateManagedContact(token, {
        guestName: name.trim(),
        guestPhone: phone.trim(),
        guestEmail: email.trim(),
      }),
  });
  const dirty =
    name.trim() !== booking.guestName ||
    phoneForComparison(phone) !==
      phoneForComparison(booking.guestPhone ?? "") ||
    email.trim() !== (booking.guestEmail ?? "");
  const { requestChange } = useUnsavedChanges({
    id: "guest-contact",
    dirty: open && dirty,
    discard: () => {
      setName(booking.guestName);
      setPhone(booking.guestPhone ?? "");
      setEmail(booking.guestEmail ?? "");
      setError("");
    },
  });

  useEffect(() => {
    if (open) {
      setName(booking.guestName);
      setPhone(booking.guestPhone ?? "");
      setEmail(booking.guestEmail ?? "");
      setError("");
    }
  }, [open, booking.guestName, booking.guestPhone, booking.guestEmail]);
  const close = () =>
    requestChange(() => onOpenChange(false), { ids: ["guest-contact"] });
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || update.isPending) return;
    setError("");
    try {
      const contact = await update.mutateAsync();
      onOpenChange(false);
      onSaved(contact);
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [
          "INVALID_BOOKING_STATUS",
          "GUEST_CONTACT_EDIT_CLOSED",
          "ORGANIZATION_ARCHIVED",
          "ORGANIZATION_SUSPENDED",
        ].includes(cause.code)
      ) {
        onOpenChange(false);
        onUnavailable(
          "Contact editing is no longer available for this booking.",
        );
      } else
        setError(
          cause instanceof ApiError && cause.code === "INVALID_GUEST_PHONE"
            ? "Please enter a valid phone number."
            : "We couldn’t save your changes. Please try again.",
        );
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !update.isPending) close();
      }}
    >
      <DialogContent
        aria-busy={update.isPending}
        className={styles.manageDialog}
      >
        <DialogTitle>Edit contact details</DialogTitle>
        <DialogDescription>
          Update how this booking can reach you.
        </DialogDescription>
        <form
          className={styles.form}
          onSubmit={(event) => {
            void save(event);
          }}
        >
          {error ? (
            <p role="alert" className={styles.errorMessage}>
              {error}
            </p>
          ) : null}
          <FormField htmlFor="edit-name" label="Name">
            <Input
              id="edit-name"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField
            htmlFor="edit-phone"
            label="Phone"
            helperText="For example, 050-123-4567"
          >
            <Input
              id="edit-phone"
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </FormField>
          <FormField htmlFor="edit-email" label="Email (optional)">
            <Input
              id="edit-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          <div className={styles.dialogActions}>
            <FormSaveStatus
              dirty={dirty}
              saving={update.isPending}
              successState="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={update.isPending}
            >
              Keep details
            </Button>
            <Button
              type="submit"
              disabled={!dirty || update.isPending}
              loading={update.isPending}
              loadingLabel="Saving…"
            >
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelBookingDialog({
  open,
  onOpenChange,
  booking,
  token,
  onCancelled,
  onUnavailable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: ManagedBooking;
  token: string;
  onCancelled: () => void;
  onUnavailable: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const cancel = useMutation({
    mutationFn: () => cancelManagedBooking(token, reason),
  });
  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
    }
  }, [open]);
  async function confirm() {
    if (cancel.isPending) return;
    setError("");
    try {
      await cancel.mutateAsync();
      onOpenChange(false);
      onCancelled();
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [
          "INVALID_BOOKING_STATUS",
          "CANCELLATION_CUTOFF_PASSED",
          "ORGANIZATION_ARCHIVED",
          "ORGANIZATION_SUSPENDED",
        ].includes(cause.code)
      ) {
        onOpenChange(false);
        onUnavailable("Cancellation is no longer available for this booking.");
      } else setError("We couldn’t cancel the booking. Please try again.");
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!cancel.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        aria-busy={cancel.isPending}
        className={styles.manageDialog}
      >
        <DialogTitle>Cancel this booking?</DialogTitle>
        <DialogDescription>
          This will cancel {booking.serviceName} with {booking.resourceName} at{" "}
          {booking.organizationName} on {formatInstant(booking.startAt)}.
        </DialogDescription>
        {error ? (
          <p role="alert" className={styles.errorMessage}>
            {error}
          </p>
        ) : null}
        <FormField htmlFor="cancel-reason" label="Reason (optional)">
          <textarea
            id="cancel-reason"
            className={styles.textarea}
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        <div className={styles.dialogActions}>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={cancel.isPending}
          >
            Keep booking
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void confirm();
            }}
            loading={cancel.isPending}
            loadingLabel="Cancelling…"
            disabled={cancel.isPending}
          >
            Cancel booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GuestBookingManagePage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [token, setToken] = useState(readToken);
  const [ready, setReady] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [editBlocked, setEditBlocked] = useState(false);
  const [cancelBlocked, setCancelBlocked] = useState(false);

  useEffect(() => {
    const update = () => {
      setReady(false);
      void queryClient.removeQueries({
        queryKey: guestBookingKey,
        exact: true,
      });
      setToken(readToken());
      setActionMessage("");
      setEditBlocked(false);
      setCancelBlocked(false);
      setReady(true);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [queryClient]);

  const bookingQuery = useQuery({
    queryKey: guestBookingKey,
    queryFn: ({ signal }) => getManagedBooking(token, signal),
    enabled: ready && Boolean(token),
    retry: false,
    refetchOnMount: "always",
  });
  const booking = bookingQuery.data;
  const justBooked = Boolean(
    (location.state as { justBooked?: boolean } | null)?.justBooked,
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("failed");
    }
  }
  function refreshWithMessage(message: string, kind: "edit" | "cancel") {
    setActionMessage(message);
    if (kind === "edit") setEditBlocked(true);
    else setCancelBlocked(true);
    void bookingQuery.refetch();
  }
  if (
    !token ||
    (bookingQuery.isError &&
      bookingQuery.error instanceof ApiError &&
      bookingQuery.error.status === 404)
  )
    return (
      <BookingState
        title="Booking link unavailable"
        description="This link is invalid or no longer available."
      />
    );
  if (!ready || bookingQuery.isPending)
    return (
      <PublicFrame>
        <main className={styles.statePage} aria-live="polite">
          <div className={styles.skeletonTitle} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </main>
      </PublicFrame>
    );
  if (bookingQuery.isError || !booking)
    return (
      <BookingState
        title="We couldn’t load your booking"
        description="Please try again in a moment."
        retry={() => {
          void bookingQuery.refetch();
        }}
      />
    );

  return (
    <PublicFrame organization={booking.organizationName}>
      <main className={styles.manageMain}>
        <div className={styles.manageLead}>
          <span className={styles.eyebrow}>YOUR APPOINTMENT</span>
          <div className={styles.statusMark}>
            {booking.status === "confirmed" ? (
              <Check size={26} aria-hidden="true" />
            ) : (
              <CalendarDays size={25} aria-hidden="true" />
            )}
          </div>
          <h1>
            {booking.status === "cancelled"
              ? "Booking cancelled"
              : booking.status === "no_show"
                ? "Booking details"
                : justBooked
                  ? "Booking confirmed"
                  : "Your booking"}
          </h1>
          <p>{booking.organizationName}</p>
          <span
            className={`${styles.statusBadge} ${booking.status === "cancelled" ? styles.statusCancelled : ""}`}
          >
            {booking.status === "no_show"
              ? "Past booking"
              : booking.status === "cancelled"
                ? "Cancelled"
                : "Confirmed"}
          </span>
        </div>
        {actionMessage ? (
          <p role="status" className={styles.manageMessage}>
            {actionMessage}
          </p>
        ) : null}
        <div className={styles.manageGrid}>
          <section
            className={styles.manageCard}
            aria-labelledby="appointment-title"
          >
            <h2 id="appointment-title">Appointment</h2>
            <div className={styles.appointmentHeadline}>
              <strong>{booking.serviceName}</strong>
              <span>{formatInstant(booking.startAt)}</span>
            </div>
            <dl className={styles.manageDetails}>
              <div>
                <dt>With</dt>
                <dd>{booking.resourceName}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{booking.durationMinutes} min</dd>
              </div>
              {booking.priceAgorot !== null ? (
                <div>
                  <dt>Price</dt>
                  <dd>{formatPrice(booking.priceAgorot)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Reference</dt>
                <dd className={styles.reference}>{booking.publicReference}</dd>
              </div>
            </dl>
          </section>
          <section
            className={styles.manageCard}
            aria-labelledby="contact-title"
          >
            <div className={styles.manageCardHeader}>
              <h2 id="contact-title">Contact details</h2>
              {booking.canEditContact && !editBlocked ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditOpen(true)}
                >
                  Edit contact
                </Button>
              ) : null}
            </div>
            <dl className={styles.manageDetails}>
              <div>
                <dt>Name</dt>
                <dd>{booking.guestName}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{booking.guestPhone ?? "—"}</dd>
              </div>
              {booking.guestEmail ? (
                <div>
                  <dt>Email</dt>
                  <dd>{booking.guestEmail}</dd>
                </div>
              ) : null}
            </dl>
            {booking.customerNote ? (
              <div className={styles.note}>
                <span>Note</span>
                <p>{booking.customerNote}</p>
              </div>
            ) : null}
          </section>
        </div>
        <section className={styles.linkSection}>
          <div>
            <h2>Keep this booking link</h2>
            <p>Save this link to view or manage your booking later.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void copyLink();
            }}
          >
            <Clipboard size={16} aria-hidden="true" />
            {copyState === "copied" ? "Copied" : "Copy management link"}
          </Button>
          {copyState === "failed" ? (
            <p role="alert" className={styles.copyError}>
              Couldn’t copy the link. Copy the address from your browser’s
              address bar.
            </p>
          ) : null}
        </section>
        {booking.status === "confirmed" ? (
          <section className={styles.cancelSection}>
            <div>
              <h2>Cancellation</h2>
              <p>
                {booking.canCancel && !cancelBlocked
                  ? `You can cancel until ${formatDeadline(booking.cancellationDeadlineAt)} (Jerusalem time).`
                  : "Cancellation is no longer available for this booking."}
              </p>
            </div>
            {booking.canCancel && !cancelBlocked ? (
              <Button
                variant="destructiveOutline"
                onClick={() => setCancelOpen(true)}
              >
                Cancel booking
              </Button>
            ) : null}
          </section>
        ) : null}
      </main>
      <EditContactDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        booking={booking}
        token={token}
        onSaved={(contact) => {
          setActionMessage("Contact details saved.");
          queryClient.setQueryData<ManagedBooking>(
            guestBookingKey,
            (current) => (current ? { ...current, ...contact } : current),
          );
          void bookingQuery.refetch();
        }}
        onUnavailable={(message) => refreshWithMessage(message, "edit")}
      />
      <CancelBookingDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        booking={booking}
        token={token}
        onCancelled={() => {
          setActionMessage("Booking cancelled.");
          queryClient.setQueryData<ManagedBooking>(
            guestBookingKey,
            (current) =>
              current
                ? {
                    ...current,
                    status: "cancelled",
                    canCancel: false,
                    canEditContact: false,
                  }
                : current,
          );
          void bookingQuery.refetch();
        }}
        onUnavailable={(message) => refreshWithMessage(message, "cancel")}
      />
    </PublicFrame>
  );
}
