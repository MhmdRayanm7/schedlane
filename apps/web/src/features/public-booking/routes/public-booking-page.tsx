import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { Input } from "@/shared/components/ui/input";
import {
  createGuestBooking,
  getBookingContext,
  getNextAvailability,
  getPublicAvailability,
  publicBookingKeys,
} from "../api/public-booking-api";
import {
  formatLocalDate,
  formatPrice,
  formatTime,
  upcomingDates,
} from "../lib/format";
import styles from "../public-booking.module.css";
import type { GuestDetails, PublicService } from "../types";

const steps = [
  "Service",
  "Resource",
  "Date & time",
  "Your details",
  "Review",
] as const;
const emptyDetails: GuestDetails = {
  guestName: "",
  guestPhone: "",
  guestEmail: "",
  customerNote: "",
};

export function PublicFrame({
  children,
  organization,
}: {
  children: React.ReactNode;
  organization?: string;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.wordmark}>
          schedlane<span className={styles.brandDot}>.</span>
        </span>
        {organization ? (
          <span className={styles.topOrganization}>{organization}</span>
        ) : null}
      </header>
      {children}
    </div>
  );
}

export function BookingState({
  title,
  description,
  retry,
}: {
  title: string;
  description: string;
  retry?: () => void;
}) {
  return (
    <PublicFrame>
      <main className={styles.statePage}>
        <div className={styles.stateMark}>
          <CalendarDays size={24} strokeWidth={1.7} />
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        {retry ? (
          <Button onClick={retry} variant="outline">
            Try again
          </Button>
        ) : null}
      </main>
    </PublicFrame>
  );
}

function ChoiceRow({
  selected,
  name,
  detail,
  onClick,
}: {
  selected: boolean;
  name: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`${styles.choice} ${selected ? styles.choiceSelected : ""}`}
      onClick={onClick}
    >
      <span className={styles.choiceText}>
        <strong>{name}</strong>
        {detail ? <span>{detail}</span> : null}
      </span>
      <span className={styles.choiceIndicator}>
        {selected ? (
          <Check size={16} strokeWidth={2.6} aria-hidden="true" />
        ) : null}
      </span>
    </button>
  );
}

function BookingSummary({
  organization,
  service,
  resource,
  date,
  time,
}: {
  organization: string;
  service?: PublicService;
  resource?: string;
  date: string;
  time: number | null;
}) {
  return (
    <aside className={styles.summary} aria-label="Booking summary">
      <div className={styles.summaryTop}>
        <span className={styles.eyebrow}>YOUR BOOKING</span>
        <h2>{organization}</h2>
      </div>
      <dl className={styles.summaryList}>
        <div>
          <dt>Service</dt>
          <dd>{service?.name ?? "Choose a service"}</dd>
        </div>
        <div>
          <dt>With</dt>
          <dd>{resource ?? "Choose a resource"}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>
            {date ? formatLocalDate(date) : "Choose a date"}
            {time !== null ? ` · ${formatTime(time)}` : ""}
          </dd>
        </div>
        {service ? (
          <div>
            <dt>Duration</dt>
            <dd>{service.durationMinutes} min</dd>
          </div>
        ) : null}
        {service?.priceAgorot !== null && service?.priceAgorot !== undefined ? (
          <div className={styles.summaryPrice}>
            <dt>Price</dt>
            <dd>{formatPrice(service.priceAgorot)}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

export function PublicBookingPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState<number | null>(null);
  const [details, setDetails] = useState<GuestDetails>(emptyDetails);
  const [message, setMessage] = useState("");
  const [nextMessage, setNextMessage] = useState("");

  const contextQuery = useQuery({
    queryKey: publicBookingKeys.context(slug),
    queryFn: ({ signal }) => getBookingContext(slug, signal),
    retry: false,
  });
  const context = contextQuery.data;
  const service = context?.services.find((item) => item.id === serviceId);
  const resource = service?.resources.find((item) => item.id === resourceId);
  const selectedDate = date || context?.bookingWindow.firstDate || "";
  const availabilityQuery = useQuery({
    queryKey: publicBookingKeys.availability(
      slug,
      serviceId,
      resourceId,
      selectedDate,
    ),
    queryFn: ({ signal }) =>
      getPublicAvailability(slug, serviceId, resourceId, selectedDate, signal),
    enabled: Boolean(service && resource && selectedDate),
    retry: false,
  });
  const nextMutation = useMutation({
    mutationFn: () =>
      getNextAvailability(slug, serviceId, resourceId, selectedDate),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createGuestBooking(slug, {
        serviceId,
        resourceId,
        date: selectedDate,
        startMinute: time ?? -1,
        ...details,
      }),
  });

  useEffect(() => {
    if (context && !date) setDate(context.bookingWindow.firstDate);
  }, [context, date]);
  useEffect(() => {
    if (steps[step]) headingRef.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (
      time !== null &&
      availabilityQuery.data &&
      !availabilityQuery.data.starts.includes(time)
    )
      setTime(null);
  }, [availabilityQuery.data, time]);

  const chooseService = (id: string) => {
    if (id === serviceId) return;
    const nextService = context?.services.find((item) => item.id === id);
    setServiceId(id);
    if (!nextService?.resources.some((item) => item.id === resourceId))
      setResourceId("");
    setTime(null);
    setMessage("");
    setNextMessage("");
  };
  const chooseResource = (id: string) => {
    setResourceId(id);
    setTime(null);
    setMessage("");
    setNextMessage("");
  };
  const chooseDate = (value: string) => {
    if (
      !context ||
      value < context.bookingWindow.firstDate ||
      value > context.bookingWindow.lastDate
    )
      return;
    setDate(value);
    setTime(null);
    setMessage("");
    setNextMessage("");
  };
  const advance = () => {
    setMessage("");
    setStep((current) => Math.min(current + 1, 4));
  };

  async function confirm() {
    if (
      !service ||
      !resource ||
      !selectedDate ||
      time === null ||
      createMutation.isPending
    )
      return;
    setMessage("");
    try {
      const booking = await createMutation.mutateAsync();
      navigate(
        `/booking/manage#token=${encodeURIComponent(booking.managementToken)}`,
        { replace: true, state: { justBooked: true } },
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === "SLOT_UNAVAILABLE") {
        setTime(null);
        setStep(2);
        await availabilityQuery.refetch();
        setMessage("That time was just booked. Choose another available time.");
        return;
      }
      if (
        error instanceof ApiError &&
        (error.code === "PUBLIC_BOOKING_NOT_FOUND" ||
          error.code === "DATE_OUTSIDE_BOOKING_WINDOW")
      ) {
        const refreshed = await contextQuery.refetch();
        const updated = refreshed.data;
        const validService = updated?.services.find(
          (item) => item.id === serviceId,
        );
        if (!validService) {
          setServiceId("");
          setResourceId("");
          setStep(0);
        } else if (
          !validService.resources.some((item) => item.id === resourceId)
        ) {
          setResourceId("");
          setStep(1);
        } else setStep(2);
        if (
          updated &&
          (selectedDate < updated.bookingWindow.firstDate ||
            selectedDate > updated.bookingWindow.lastDate)
        )
          setDate(updated.bookingWindow.firstDate);
        setTime(null);
        setMessage("Booking options changed. Please check your selection.");
        return;
      }
      setMessage(
        error instanceof ApiError && error.code === "INVALID_GUEST_PHONE"
          ? "Please check your phone number and try again."
          : "We couldn’t confirm your booking. Please try again.",
      );
    }
  }

  if (contextQuery.isPending)
    return (
      <PublicFrame>
        <main className={styles.statePage} aria-live="polite">
          <div className={styles.skeletonTitle} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </main>
      </PublicFrame>
    );
  if (contextQuery.isError)
    return (
      <BookingState
        title={
          contextQuery.error instanceof ApiError &&
          contextQuery.error.status === 404
            ? "Booking page unavailable"
            : "We couldn’t load this booking page"
        }
        description={
          contextQuery.error instanceof ApiError &&
          contextQuery.error.status === 404
            ? "This booking page is not available right now."
            : "Please try again in a moment."
        }
        retry={
          contextQuery.error instanceof ApiError &&
          contextQuery.error.status === 404
            ? undefined
            : () => {
                void contextQuery.refetch();
              }
        }
      />
    );
  if (!context || context.services.length === 0)
    return (
      <BookingState
        title="No services available"
        description="No services are available to book right now."
      />
    );

  const canContinue =
    step === 0
      ? Boolean(service)
      : step === 1
        ? Boolean(resource)
        : step === 2
          ? time !== null
          : true;
  const dateOptions = upcomingDates(
    context.bookingWindow.firstDate,
    context.bookingWindow.lastDate,
    selectedDate,
  );
  return (
    <PublicFrame organization={context.organization.name}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>ONLINE BOOKING</span>
          <h1>
            Book with{" "}
            <span className={styles.introName}>
              {context.organization.name}
            </span>
          </h1>
          <p>Choose a time that works for you.</p>
        </div>
        <nav className={styles.progress} aria-label="Booking steps">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`${styles.progressStep} ${index === step ? styles.progressCurrent : ""}`}
              aria-current={index === step ? "step" : undefined}
              disabled={
                index > step ||
                (index === 1 && !service) ||
                (index === 2 && !resource) ||
                (index === 3 && time === null)
              }
              onClick={() => {
                setMessage("");
                setStep(index);
              }}
            >
              <span>
                {index < step ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className={styles.layout}>
          <section className={styles.panel} aria-live="off">
            <div className={styles.stepHeader}>
              <span className={styles.stepCounter}>STEP {step + 1} OF 5</span>
              <h2 tabIndex={-1} ref={headingRef}>
                {steps[step]}
              </h2>
              <p>
                {
                  [
                    "What would you like to book?",
                    "Choose who or what you’re booking with.",
                    "Find a date and a time that suits you.",
                    "How can we reach you about this booking?",
                    "Check everything before confirming your booking.",
                  ][step]
                }
              </p>
            </div>
            {message ? (
              <p role="alert" className={styles.errorMessage}>
                {message}
              </p>
            ) : null}
            {step === 0 ? (
              <div className={styles.choices}>
                {context.services.map((item) => (
                  <ChoiceRow
                    key={item.id}
                    selected={item.id === serviceId}
                    name={item.name}
                    detail={`${item.durationMinutes} min${item.priceAgorot !== null ? ` · ${formatPrice(item.priceAgorot)}` : ""}`}
                    onClick={() => chooseService(item.id)}
                  />
                ))}
              </div>
            ) : null}
            {step === 1 ? (
              <div className={styles.choices}>
                {service?.resources.map((item) => (
                  <ChoiceRow
                    key={item.id}
                    selected={item.id === resourceId}
                    name={item.name}
                    onClick={() => chooseResource(item.id)}
                  />
                ))}
              </div>
            ) : null}
            {step === 2 ? (
              <div className={styles.dateTime}>
                <div className={styles.dateHeading}>
                  <h3>Choose a date</h3>
                  <span>{formatLocalDate(selectedDate)}</span>
                </div>
                <div className={styles.dateStrip}>
                  {dateOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={item === selectedDate}
                      className={`${styles.dateButton} ${item === selectedDate ? styles.dateSelected : ""}`}
                      onClick={() => chooseDate(item)}
                    >
                      <span>{formatLocalDate(item, { weekday: "short" })}</span>
                      <strong>
                        {formatLocalDate(item, { day: "numeric" })}
                      </strong>
                      <span>{formatLocalDate(item, { month: "short" })}</span>
                    </button>
                  ))}
                </div>
                <label className={styles.dateInputLabel} htmlFor="booking-date">
                  <CalendarDays size={17} aria-hidden="true" /> Choose another
                  date
                </label>
                <Input
                  id="booking-date"
                  type="date"
                  className={styles.dateInput}
                  value={selectedDate}
                  min={context.bookingWindow.firstDate}
                  max={context.bookingWindow.lastDate}
                  onChange={(event) => chooseDate(event.target.value)}
                />
                <div className={styles.timeHeading}>
                  <h3>Available times</h3>
                  <span>Asia/Jerusalem</span>
                </div>
                {availabilityQuery.isPending ||
                (availabilityQuery.isFetching && !availabilityQuery.data) ? (
                  <div className={styles.slotSkeletons} aria-live="polite">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                ) : null}
                {availabilityQuery.isError ? (
                  <div className={styles.emptySlots}>
                    <p>We couldn’t load times for this date.</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        void availabilityQuery.refetch();
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                ) : null}
                {availabilityQuery.data?.starts.length ? (
                  <div className={styles.slotGrid}>
                    {availabilityQuery.data.starts.map((start) => (
                      <button
                        key={start}
                        type="button"
                        className={`${styles.slot} ${time === start ? styles.slotSelected : ""}`}
                        aria-pressed={time === start}
                        onClick={() => setTime(start)}
                      >
                        {formatTime(start)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {availabilityQuery.data &&
                availabilityQuery.data.starts.length === 0 ? (
                  <div className={styles.emptySlots}>
                    <Clock3 size={20} aria-hidden="true" />
                    <p>No times available on this date.</p>
                    <Button
                      variant="outline"
                      loading={nextMutation.isPending}
                      loadingLabel="Searching…"
                      disabled={nextMutation.isPending}
                      onClick={async () => {
                        setNextMessage("");
                        try {
                          const result = await nextMutation.mutateAsync();
                          if (result.availability) {
                            chooseDate(result.availability.date);
                            queryClient.setQueryData(
                              publicBookingKeys.availability(
                                slug,
                                serviceId,
                                resourceId,
                                result.availability.date,
                              ),
                              result.availability,
                            );
                          } else
                            setNextMessage(
                              "No availability found in the current booking window. Try another service or resource.",
                            );
                        } catch {
                          setNextMessage(
                            "We couldn’t search for the next opening. Please try again.",
                          );
                        }
                      }}
                    >
                      Find next available
                    </Button>
                    {nextMessage ? <p role="status">{nextMessage}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {step === 3 ? (
              <form
                id="guest-details"
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (event.currentTarget.reportValidity()) advance();
                }}
              >
                <FormField htmlFor="guest-name" label="Name">
                  <Input
                    id="guest-name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    value={details.guestName}
                    onChange={(event) =>
                      setDetails({ ...details, guestName: event.target.value })
                    }
                  />
                </FormField>
                <FormField
                  htmlFor="guest-phone"
                  label="Phone"
                  helperText="For example, 050-123-4567"
                >
                  <Input
                    id="guest-phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={details.guestPhone}
                    onChange={(event) =>
                      setDetails({ ...details, guestPhone: event.target.value })
                    }
                  />
                </FormField>
                <FormField htmlFor="guest-email" label="Email (optional)">
                  <Input
                    id="guest-email"
                    type="email"
                    autoComplete="email"
                    value={details.guestEmail}
                    onChange={(event) =>
                      setDetails({ ...details, guestEmail: event.target.value })
                    }
                  />
                </FormField>
                <FormField
                  htmlFor="guest-note"
                  label="Anything we should know? (optional)"
                >
                  <textarea
                    id="guest-note"
                    className={styles.textarea}
                    rows={3}
                    maxLength={1000}
                    value={details.customerNote}
                    onChange={(event) =>
                      setDetails({
                        ...details,
                        customerNote: event.target.value,
                      })
                    }
                  />
                </FormField>
              </form>
            ) : null}
            {step === 4 ? (
              <div className={styles.review}>
                <div>
                  <div className={styles.reviewHeading}>
                    <h3>Appointment</h3>
                    <button type="button" onClick={() => setStep(0)}>
                      Edit
                    </button>
                  </div>
                  <p>
                    <strong>{context.organization.name}</strong>
                    <br />
                    {service?.name} · {service?.durationMinutes} min
                    <br />
                    {resource?.name}
                    <br />
                    {formatLocalDate(selectedDate)} ·{" "}
                    {time !== null ? formatTime(time) : ""}
                  </p>
                  {service?.priceAgorot !== null &&
                  service?.priceAgorot !== undefined ? (
                    <p>Price {formatPrice(service.priceAgorot)}</p>
                  ) : null}
                  <button
                    type="button"
                    className={styles.textAction}
                    onClick={() => setStep(2)}
                  >
                    Change date or time
                  </button>
                </div>
                <div>
                  <div className={styles.reviewHeading}>
                    <h3>Your details</h3>
                    <button type="button" onClick={() => setStep(3)}>
                      Edit
                    </button>
                  </div>
                  <p>
                    <strong>{details.guestName.trim()}</strong>
                    <br />
                    {details.guestPhone.trim()}
                    {details.guestEmail.trim() ? (
                      <>
                        <br />
                        {details.guestEmail.trim()}
                      </>
                    ) : null}
                  </p>
                  {details.customerNote.trim() ? (
                    <p className={styles.reviewNote}>
                      “{details.customerNote.trim()}”
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className={styles.actions}>
              {step > 0 ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMessage("");
                    setStep(step - 1);
                  }}
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Back
                </Button>
              ) : (
                <span />
              )}
              {step === 3 ? (
                <Button form="guest-details" type="submit">
                  Continue <ArrowRight size={16} aria-hidden="true" />
                </Button>
              ) : step === 4 ? (
                <Button
                  onClick={() => {
                    void confirm();
                  }}
                  loading={createMutation.isPending}
                  loadingLabel="Confirming…"
                  disabled={createMutation.isPending}
                >
                  Confirm booking
                </Button>
              ) : (
                <Button onClick={advance} disabled={!canContinue}>
                  Continue <ArrowRight size={16} aria-hidden="true" />
                </Button>
              )}
            </div>
          </section>
          <BookingSummary
            organization={context.organization.name}
            service={service}
            resource={resource?.name}
            date={selectedDate}
            time={time}
          />
        </div>
      </main>
    </PublicFrame>
  );
}
