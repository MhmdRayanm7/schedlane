import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
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
  type BookingStep,
  bookingStepDescriptions,
  bookingStepLabels,
  type GuestField,
  type GuestFieldErrors,
  guestFieldForApiError,
  initialBookingSelection,
  selectionAfterServiceChange,
  validateGuestDetails,
  visibleBookingSteps,
} from "../lib/booking-flow";
import {
  formatLocalDate,
  formatPrice,
  formatTime,
  upcomingDates,
} from "../lib/format";
import styles from "../public-booking.module.css";
import type { GuestDetails, PublicService } from "../types";

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
  const [searchParams] = useSearchParams();
  const share = searchParams.has("share")
    ? (searchParams.get("share") ?? "")
    : undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<BookingStep>("service");
  const [serviceId, setServiceId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState<number | null>(null);
  const [details, setDetails] = useState<GuestDetails>(emptyDetails);
  const [message, setMessage] = useState("");
  const [nextMessage, setNextMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<GuestFieldErrors>({});
  const [shareUnavailable, setShareUnavailable] = useState(false);

  const contextQuery = useQuery({
    queryKey: publicBookingKeys.context(slug, share),
    queryFn: ({ signal }) => getBookingContext(slug, share, signal),
    retry: false,
  });
  const context = contextQuery.data;
  const visibleSteps = context
    ? visibleBookingSteps(context.services, serviceId)
    : [];
  const currentStep = visibleSteps.includes(step)
    ? step
    : (visibleSteps[0] ?? "dateTime");
  const stepIndex = visibleSteps.indexOf(currentStep);
  const service = context?.services.find((item) => item.id === serviceId);
  const resource = service?.resources.find((item) => item.id === resourceId);
  const selectedDate = date;
  const availabilityQuery = useQuery({
    queryKey: publicBookingKeys.availability(
      slug,
      serviceId,
      resourceId,
      selectedDate,
      share,
    ),
    queryFn: ({ signal }) =>
      getPublicAvailability(
        slug,
        serviceId,
        resourceId,
        selectedDate,
        share,
        signal,
      ),
    enabled: Boolean(service && resource && selectedDate),
    retry: false,
  });
  const nextMutation = useMutation({
    mutationFn: () =>
      getNextAvailability(slug, serviceId, resourceId, selectedDate, share),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createGuestBooking(
        slug,
        {
          serviceId,
          resourceId,
          date: selectedDate,
          startMinute: time ?? -1,
          ...details,
        },
        share,
      ),
  });

  useEffect(() => {
    if (!context) return;
    const initial = initialBookingSelection(context.services);
    if (initial.serviceId && !serviceId) setServiceId(initial.serviceId);
    if (initial.resourceId && !resourceId) setResourceId(initial.resourceId);
  }, [context, resourceId, serviceId]);
  useEffect(() => {
    if (!context || visibleSteps.length === 0) return;
    if (currentStep !== step) setStep(currentStep);
    headingRef.current?.focus({ preventScroll: true });
  }, [context, currentStep, step, visibleSteps.length]);
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
    const selection = selectionAfterServiceChange(
      context?.services ?? [],
      id,
      resourceId,
    );
    setServiceId(selection.serviceId);
    setResourceId(selection.resourceId);
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
    setStep(
      visibleSteps[Math.min(stepIndex + 1, visibleSteps.length - 1)] ??
        currentStep,
    );
  };

  const focusGuestField = (field: GuestField) => {
    const refs = {
      guestName: nameRef,
      guestPhone: phoneRef,
      guestEmail: emailRef,
    };
    window.setTimeout(() => refs[field].current?.focus(), 0);
  };

  const validateDetailsAndAdvance = () => {
    const errors = validateGuestDetails(details);
    setFieldErrors(errors);
    const firstInvalid = (
      ["guestName", "guestPhone", "guestEmail"] as const
    ).find((field) => errors[field]);
    if (firstInvalid) {
      focusGuestField(firstInvalid);
      return;
    }
    setDetails((current) => ({
      ...current,
      guestName: current.guestName.trim(),
      guestPhone: current.guestPhone.trim(),
      guestEmail: current.guestEmail.trim(),
    }));
    advance();
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
        {
          replace: true,
          state: {
            justBooked: true,
            confirmationEmail: details.guestEmail.trim() || null,
          },
        },
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === "SLOT_UNAVAILABLE") {
        setTime(null);
        setStep("dateTime");
        await availabilityQuery.refetch();
        setMessage("That time was just booked. Choose another available time.");
        return;
      }
      if (
        error instanceof ApiError &&
        (error.code === "PUBLIC_BOOKING_NOT_FOUND" ||
          error.code === "DATE_OUTSIDE_BOOKING_WINDOW")
      ) {
        if (share !== undefined && error.code === "PUBLIC_BOOKING_NOT_FOUND") {
          setShareUnavailable(true);
          return;
        }
        const refreshed = await contextQuery.refetch();
        const updated = refreshed.data;
        const validService = updated?.services.find(
          (item) => item.id === serviceId,
        );
        if (!validService) {
          setServiceId("");
          setResourceId("");
          setStep(
            visibleBookingSteps(updated?.services ?? [], "")[0] ?? "dateTime",
          );
        } else if (
          !validService.resources.some((item) => item.id === resourceId)
        ) {
          const selection = selectionAfterServiceChange(
            updated?.services ?? [],
            validService.id,
            "",
          );
          setResourceId(selection.resourceId);
          setStep(selection.resourceId ? "dateTime" : "resource");
        } else setStep("dateTime");
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
      if (error instanceof ApiError) {
        const field = guestFieldForApiError(error.code);
        if (field) {
          setFieldErrors((current) => ({
            ...current,
            [field]:
              field === "guestName"
                ? "Enter your name."
                : field === "guestPhone"
                  ? "Enter a valid Israeli phone number."
                  : "Enter a valid email address.",
          }));
          setStep("details");
          focusGuestField(field);
          return;
        }
      }
      setMessage("We couldn’t confirm your booking. Please try again.");
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
  if (shareUnavailable)
    return (
      <BookingState
        title="Booking link unavailable"
        description="This booking link is no longer available."
      />
    );
  if (contextQuery.isError)
    return (
      <BookingState
        title={
          contextQuery.error instanceof ApiError &&
          contextQuery.error.status === 404
            ? share !== undefined
              ? "Booking link unavailable"
              : "Booking page unavailable"
            : "We couldn’t load this booking page"
        }
        description={
          contextQuery.error instanceof ApiError &&
          contextQuery.error.status === 404
            ? share !== undefined
              ? "This booking link is no longer available."
              : "This booking page is not available right now."
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
    currentStep === "service"
      ? Boolean(service)
      : currentStep === "resource"
        ? Boolean(resource)
        : currentStep === "dateTime"
          ? Boolean(selectedDate) && time !== null
          : true;
  const dateOptions = upcomingDates(
    context.bookingWindow.firstDate,
    context.bookingWindow.lastDate,
    selectedDate || context.bookingWindow.firstDate,
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
          {visibleSteps.map((visibleStep, index) => (
            <button
              key={visibleStep}
              type="button"
              className={`${styles.progressStep} ${visibleStep === currentStep ? styles.progressCurrent : ""}`}
              aria-current={visibleStep === currentStep ? "step" : undefined}
              disabled={index > stepIndex}
              onClick={() => {
                setMessage("");
                setStep(visibleStep);
              }}
            >
              <span>
                {index < stepIndex ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span>{bookingStepLabels[visibleStep]}</span>
            </button>
          ))}
        </nav>
        <div className={styles.layout}>
          <section className={styles.panel} aria-live="off">
            <div className={styles.stepHeader}>
              <span className={styles.stepCounter}>
                STEP {stepIndex + 1} OF {visibleSteps.length}
              </span>
              <h2 tabIndex={-1} ref={headingRef}>
                {bookingStepLabels[currentStep]}
              </h2>
              <p>{bookingStepDescriptions[currentStep]}</p>
            </div>
            {message ? (
              <p role="alert" className={styles.errorMessage}>
                {message}
              </p>
            ) : null}
            {currentStep === "service" ? (
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
            {currentStep === "resource" ? (
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
            {currentStep === "dateTime" ? (
              <div className={styles.dateTime}>
                <div className={styles.dateHeading}>
                  <h3>Choose a date</h3>
                  <span>
                    {selectedDate
                      ? formatLocalDate(selectedDate)
                      : "Choose a date"}
                  </span>
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
                                share,
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
            {currentStep === "details" ? (
              <form
                id="guest-details"
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  validateDetailsAndAdvance();
                }}
              >
                <FormField
                  htmlFor="guest-name"
                  label="Name"
                  error={fieldErrors.guestName}
                >
                  <Input
                    id="guest-name"
                    ref={nameRef}
                    autoComplete="name"
                    required
                    maxLength={120}
                    aria-invalid={Boolean(fieldErrors.guestName)}
                    aria-describedby={
                      fieldErrors.guestName ? "guest-name-error" : undefined
                    }
                    value={details.guestName}
                    onChange={(event) => {
                      setDetails({ ...details, guestName: event.target.value });
                      setFieldErrors((current) => ({
                        ...current,
                        guestName: undefined,
                      }));
                    }}
                  />
                </FormField>
                <FormField
                  htmlFor="guest-phone"
                  label="Phone"
                  helperText="For example, 050-123-4567"
                  error={fieldErrors.guestPhone}
                >
                  <Input
                    id="guest-phone"
                    ref={phoneRef}
                    type="tel"
                    autoComplete="tel"
                    required
                    aria-invalid={Boolean(fieldErrors.guestPhone)}
                    aria-describedby={
                      fieldErrors.guestPhone
                        ? "guest-phone-error"
                        : "guest-phone-helper"
                    }
                    value={details.guestPhone}
                    onChange={(event) => {
                      setDetails({
                        ...details,
                        guestPhone: event.target.value,
                      });
                      setFieldErrors((current) => ({
                        ...current,
                        guestPhone: undefined,
                      }));
                    }}
                  />
                </FormField>
                <FormField
                  htmlFor="guest-email"
                  label="Email (optional)"
                  error={fieldErrors.guestEmail}
                >
                  <Input
                    id="guest-email"
                    ref={emailRef}
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(fieldErrors.guestEmail)}
                    aria-describedby={
                      fieldErrors.guestEmail ? "guest-email-error" : undefined
                    }
                    value={details.guestEmail}
                    onChange={(event) => {
                      setDetails({
                        ...details,
                        guestEmail: event.target.value,
                      });
                      setFieldErrors((current) => ({
                        ...current,
                        guestEmail: undefined,
                      }));
                    }}
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
            {currentStep === "review" ? (
              <div className={styles.review}>
                <div>
                  <div className={styles.reviewHeading}>
                    <h3>Appointment</h3>
                    <button
                      type="button"
                      onClick={() => setStep(visibleSteps[0] ?? "dateTime")}
                    >
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
                    onClick={() => setStep("dateTime")}
                  >
                    Change date or time
                  </button>
                </div>
                <div>
                  <div className={styles.reviewHeading}>
                    <h3>Your details</h3>
                    <button type="button" onClick={() => setStep("details")}>
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
              {stepIndex > 0 ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMessage("");
                    setStep(visibleSteps[stepIndex - 1] ?? currentStep);
                  }}
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Back
                </Button>
              ) : (
                <span />
              )}
              {currentStep === "details" ? (
                <Button form="guest-details" type="submit">
                  Continue <ArrowRight size={16} aria-hidden="true" />
                </Button>
              ) : currentStep === "review" ? (
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
