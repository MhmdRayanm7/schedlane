import { escapeHtml } from "../../email/branded-template.js";
import type { ValidatedBookingEvent } from "../event-schema.js";
import { formatJerusalemDateTime } from "./date-format.js";

export interface RenderedEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface BookingEmailContext {
  organizationName: string;
  organizationSlug: string;
  resourceName: string;
  serviceName: string;
}

export interface BookingReminderEmailData {
  guestName: string | null;
  guestEmail: string;
  publicReference: string;
  startAt: string;
  durationMinutes: number;
  priceAgorot: number | null;
}

function businessName(context?: BookingEmailContext) {
  return context?.organizationName || "Schedlane";
}

function greeting(name: string | null) {
  return name?.trim() ? [`Hi ${name.trim()},`, ""] : [];
}

function money(priceAgorot: number) {
  return `₪${(priceAgorot / 100).toFixed(2)}`;
}

function textContext(context?: BookingEmailContext) {
  if (!context) return [];
  return [
    context.organizationName,
    `Service: ${context.serviceName}`,
    ...(context.resourceName ? [`With: ${context.resourceName}`] : []),
  ];
}

function detailRow(label: string, value: string) {
  return `<tr><td style="padding:7px 12px 7px 0;color:#66706E;vertical-align:top">${escapeHtml(label)}</td><td style="padding:7px 0;font-weight:600;text-align:right;vertical-align:top">${escapeHtml(value)}</td></tr>`;
}

function detailTable(rows: string[]) {
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rows.join("")}</table>`;
}

function appointmentCard(input: {
  context?: BookingEmailContext | undefined;
  dateTime: string;
  durationMinutes?: number | undefined;
  priceAgorot?: number | null;
  label?: string | undefined;
  muted?: boolean | undefined;
}) {
  const rows = [
    ...(input.context?.resourceName
      ? [detailRow("With", input.context.resourceName)]
      : []),
    ...(input.durationMinutes
      ? [detailRow("Duration", `${input.durationMinutes} min`)]
      : []),
    ...(input.priceAgorot !== null && input.priceAgorot !== undefined
      ? [detailRow("Price", money(input.priceAgorot))]
      : []),
  ].join("");
  return `<div style="margin:0 0 18px;padding:20px;border:1px solid #E5E9E8;border-radius:8px;background:${input.muted ? "#F7F8F8" : "#FFFFFF"}">${
    input.label
      ? `<div style="margin:0 0 10px;color:#66706E;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(input.label)}</div>`
      : ""
  }<div style="font-size:20px;font-weight:700;line-height:1.3">${escapeHtml(input.context?.serviceName ?? "Appointment")}</div><div style="margin-top:6px;color:#0F766E;font-size:16px;font-weight:600">${escapeHtml(input.dateTime)}</div>${
    rows
      ? `<table role="presentation" style="width:100%;margin-top:14px;border-collapse:collapse;font-size:14px">${rows}</table>`
      : ""
  }</div>`;
}

function bookingEmailShell(input: {
  title: string;
  organizationName: string;
  greetingName: string | null;
  intro: string;
  content: string;
  action?: { label: string; url: string } | undefined;
  footer?: string | undefined;
}) {
  const greetingHtml = input.greetingName?.trim()
    ? `<p style="margin:0 0 16px;line-height:1.6">Hi ${escapeHtml(input.greetingName.trim())},</p>`
    : "";
  const actionHtml = input.action
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:12px 18px;border-radius:6px;background:#0F766E;color:#FFFFFF;text-decoration:none;font-weight:600">${escapeHtml(input.action.label)}</a></p>`
    : "";
  const footerHtml = input.footer
    ? `<p style="margin:24px 0 0;color:#66706E;font-size:13px;line-height:1.5">${escapeHtml(input.footer)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F7F8F8;color:#181B1B;font-family:Arial,sans-serif"><div style="padding:28px 14px"><div style="max-width:560px;margin:auto;border:1px solid #E5E9E8;border-radius:8px;background:#FFFFFF;padding:28px"><div style="margin-bottom:20px;color:#0F766E;font-size:20px;font-weight:700">Schedlane</div><div style="margin:0 0 8px;color:#66706E;font-size:14px;font-weight:600">${escapeHtml(input.organizationName)}</div><h1 style="margin:0 0 20px;font-size:24px;line-height:1.25">${escapeHtml(input.title)}</h1>${greetingHtml}<p style="margin:0 0 20px;line-height:1.6">${escapeHtml(input.intro)}</p>${input.content}${actionHtml}${footerHtml}</div></div></body></html>`;
}

export function renderBookingCreatedEmail(
  event: Extract<ValidatedBookingEvent, { eventType: "booking.created" }>,
  managementUrl?: string | null,
  context?: BookingEmailContext,
): RenderedEmail {
  const payload = event.payload;
  if (!payload.guestEmail)
    throw new Error("Cannot render email without guest email");
  const dateTime = formatJerusalemDateTime(payload.startAt);
  const lines = [
    ...greeting(payload.guestName),
    "Your appointment is confirmed.",
    "",
    ...textContext(context),
    `Appointment: ${dateTime} (Asia/Jerusalem)`,
    `Duration: ${payload.durationMinutes} min`,
    ...(payload.priceAgorot !== null
      ? [`Price: ${money(payload.priceAgorot)}`]
      : []),
    `Reference: ${payload.publicReference}`,
    ...(managementUrl ? ["", "Manage booking:", managementUrl] : []),
  ];
  return {
    to: payload.guestEmail,
    subject: `Booking confirmed with ${businessName(context)}`,
    text: lines.join("\n"),
    html: bookingEmailShell({
      title: "Your appointment is confirmed",
      organizationName: businessName(context),
      greetingName: payload.guestName,
      intro: "Your appointment details are below.",
      content: `${appointmentCard({ context, dateTime, durationMinutes: payload.durationMinutes, priceAgorot: payload.priceAgorot })}${detailTable([detailRow("Reference", payload.publicReference)])}`,
      action: managementUrl
        ? { label: "Manage booking", url: managementUrl }
        : undefined,
      footer: "Times are shown in Jerusalem time.",
    }),
  };
}

export function renderBookingRescheduledEmail(
  event: Extract<ValidatedBookingEvent, { eventType: "booking.rescheduled" }>,
  managementUrl?: string | null,
  context?: BookingEmailContext,
): RenderedEmail {
  const payload = event.payload;
  if (!payload.guestEmail)
    throw new Error("Cannot render email without guest email");
  const previous = formatJerusalemDateTime(payload.previousStartAt);
  const next = formatJerusalemDateTime(payload.startAt);
  const lines = [
    ...greeting(payload.guestName),
    "Your appointment has been updated.",
    "",
    ...textContext(context),
    `Previous appointment: ${previous} (Asia/Jerusalem)`,
    `New appointment: ${next} (Asia/Jerusalem)`,
    `Duration: ${payload.durationMinutes} min`,
    ...(payload.priceAgorot !== null
      ? [`Price: ${money(payload.priceAgorot)}`]
      : []),
    `Reference: ${payload.publicReference}`,
    ...(managementUrl ? ["", "Manage booking:", managementUrl] : []),
  ];
  return {
    to: payload.guestEmail,
    subject: `Booking updated with ${businessName(context)}`,
    text: lines.join("\n"),
    html: bookingEmailShell({
      title: "Your appointment has been updated",
      organizationName: businessName(context),
      greetingName: payload.guestName,
      intro: "Please use the new appointment time below.",
      content: `${appointmentCard({ context, dateTime: next, durationMinutes: payload.durationMinutes, priceAgorot: payload.priceAgorot, label: "New appointment" })}${appointmentCard({ context, dateTime: previous, label: "Previous appointment", muted: true })}${detailTable([detailRow("Reference", payload.publicReference)])}`,
      action: managementUrl
        ? { label: "Manage booking", url: managementUrl }
        : undefined,
      footer: "Times are shown in Jerusalem time.",
    }),
  };
}

export function renderBookingCancelledEmail(
  event: Extract<ValidatedBookingEvent, { eventType: "booking.cancelled" }>,
  bookingUrl?: string | null,
  context?: BookingEmailContext,
): RenderedEmail {
  const payload = event.payload;
  if (!payload.guestEmail)
    throw new Error("Cannot render email without guest email");
  const dateTime = formatJerusalemDateTime(payload.startAt);
  const lines = [
    ...greeting(payload.guestName),
    "Your appointment has been cancelled.",
    "",
    ...textContext(context),
    `Scheduled appointment: ${dateTime} (Asia/Jerusalem)`,
    ...(payload.cancellationReason
      ? [`Cancellation reason: ${payload.cancellationReason}`]
      : []),
    `Reference: ${payload.publicReference}`,
    ...(bookingUrl ? ["", "Book another appointment:", bookingUrl] : []),
  ];
  const reason = payload.cancellationReason
    ? `<p style="margin:0 0 18px;line-height:1.6"><strong>Cancellation reason:</strong> ${escapeHtml(payload.cancellationReason)}</p>`
    : "";
  return {
    to: payload.guestEmail,
    subject: `Booking cancelled with ${businessName(context)}`,
    text: lines.join("\n"),
    html: bookingEmailShell({
      title: "Your appointment has been cancelled",
      organizationName: businessName(context),
      greetingName: payload.guestName,
      intro: "This appointment is cancelled and no further action is needed.",
      content: `${appointmentCard({ context, dateTime, label: "Cancelled appointment", muted: true })}${reason}${detailTable([detailRow("Reference", payload.publicReference)])}`,
      action: bookingUrl
        ? { label: "Book another appointment", url: bookingUrl }
        : undefined,
    }),
  };
}

export function renderBookingReminderEmail(
  data: BookingReminderEmailData,
  managementUrl: string | null,
  context: BookingEmailContext,
): RenderedEmail {
  const dateTime = formatJerusalemDateTime(data.startAt);
  const lines = [
    ...greeting(data.guestName),
    "Your appointment is tomorrow.",
    "",
    ...textContext(context),
    `Appointment: ${dateTime} (Asia/Jerusalem)`,
    `Duration: ${data.durationMinutes} min`,
    ...(data.priceAgorot !== null ? [`Price: ${money(data.priceAgorot)}`] : []),
    `Reference: ${data.publicReference}`,
    ...(managementUrl
      ? [
          "",
          "Manage booking:",
          managementUrl,
          "",
          "Need to make a change? Use your secure booking link.",
        ]
      : []),
  ];

  return {
    to: data.guestEmail,
    subject: `Appointment reminder — ${businessName(context)}`,
    text: lines.join("\n"),
    html: bookingEmailShell({
      title: "Appointment reminder",
      organizationName: businessName(context),
      greetingName: data.guestName,
      intro: "Your appointment is tomorrow.",
      content: `${appointmentCard({ context, dateTime, durationMinutes: data.durationMinutes, priceAgorot: data.priceAgorot })}${detailTable([detailRow("Reference", data.publicReference)])}`,
      action: managementUrl
        ? { label: "Manage booking", url: managementUrl }
        : undefined,
      footer: managementUrl
        ? "Need to make a change? Use your secure booking link. Times are shown in Jerusalem time."
        : "Times are shown in Jerusalem time.",
    }),
  };
}
