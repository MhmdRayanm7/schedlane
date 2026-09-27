import {
  brandedEmailShell,
  escapeHtml,
  supportLine,
} from "../../email/branded-template.js";
import type { ValidatedPublicationEvent } from "../event-schema.js";

export type RenderedEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function withSupport(lines: string[], supportEmail?: string) {
  const support = supportLine(supportEmail);
  return support ? [...lines, "", support] : lines;
}

export function renderPublicationRequestedEmail(
  event: Extract<
    ValidatedPublicationEvent,
    { eventType: "organization.publication_requested" }
  >,
  settingsUrl?: string,
  supportEmail?: string,
): RenderedEmail {
  const text = withSupport(
    [
      `Hi ${event.payload.recipientName},`,
      "",
      `We received the publication request for ${event.payload.organizationName}.`,
      "Our platform team will review the current setup. We'll email you when a decision is made.",
    ],
    supportEmail,
  );
  if (settingsUrl)
    text.splice(
      text.length - (supportEmail ? 2 : 0),
      0,
      "",
      "View publication status:",
      settingsUrl,
    );
  return {
    to: event.payload.recipientEmail,
    subject: `Publication requested for ${event.payload.organizationName}`,
    text: text.join("\n"),
    html: brandedEmailShell(
      "Publication request received",
      [
        `Hi ${escapeHtml(event.payload.recipientName)},`,
        `We received the publication request for <strong>${escapeHtml(event.payload.organizationName)}</strong>.`,
        "Our platform team will review the current setup. We'll email you when a decision is made.",
        ...(supportLine(supportEmail)
          ? [escapeHtml(supportLine(supportEmail) as string)]
          : []),
      ],
      settingsUrl
        ? { label: "View publication status", url: settingsUrl }
        : undefined,
    ),
  };
}

export function renderInternalPublicationRequestEmail(
  event: Extract<
    ValidatedPublicationEvent,
    { eventType: "organization.publication_requested" }
  >,
  to: string,
  reviewUrl?: string,
): RenderedEmail {
  const details = [
    `Organization: ${event.payload.organizationName}`,
    `Slug: ${event.payload.organizationSlug}`,
    `Requester: ${event.payload.recipientName} (${event.payload.recipientEmail})`,
    `Request ID: ${event.payload.requestId}`,
  ];
  if (reviewUrl) details.push("", "Review publication request:", reviewUrl);
  return {
    to,
    subject: `Publication review: ${event.payload.organizationName}`,
    text: details.join("\n"),
    html: brandedEmailShell(
      "Review publication request",
      details.filter(Boolean).map(escapeHtml),
      reviewUrl ? { label: "Review publication", url: reviewUrl } : undefined,
    ),
  };
}

export function renderPublishedEmail(
  event: Extract<
    ValidatedPublicationEvent,
    { eventType: "organization.published" }
  >,
  bookingUrl?: string,
  supportEmail?: string,
): RenderedEmail {
  const lines = withSupport(
    [
      `Hi ${event.payload.recipientName},`,
      "",
      `${event.payload.organizationName} is now published and its booking page is live.`,
      "You can pause customer bookings independently at any time from Booking page settings.",
    ],
    supportEmail,
  );
  if (bookingUrl)
    lines.splice(
      lines.length - (supportEmail ? 2 : 0),
      0,
      "",
      "Open booking page:",
      bookingUrl,
    );
  return {
    to: event.payload.recipientEmail,
    subject: `${event.payload.organizationName} is now published`,
    text: lines.join("\n"),
    html: brandedEmailShell(
      "Your booking page is live",
      [
        `Hi ${escapeHtml(event.payload.recipientName)},`,
        `<strong>${escapeHtml(event.payload.organizationName)}</strong> is now published and its booking page is live.`,
        "You can pause customer bookings independently at any time from Booking page settings.",
        ...(supportLine(supportEmail)
          ? [escapeHtml(supportLine(supportEmail) as string)]
          : []),
      ],
      bookingUrl ? { label: "Open booking page", url: bookingUrl } : undefined,
    ),
  };
}

export function renderPublicationRejectedEmail(
  event: Extract<
    ValidatedPublicationEvent,
    { eventType: "organization.publication_rejected" }
  >,
  settingsUrl?: string,
  supportEmail?: string,
): RenderedEmail {
  const lines = withSupport(
    [
      `Hi ${event.payload.recipientName},`,
      "",
      `The publication request for ${event.payload.organizationName} needs an update.`,
      `Reason: ${event.payload.rejectionReason}`,
      "You can fix the setup and submit a new publication request.",
    ],
    supportEmail,
  );
  return {
    to: event.payload.recipientEmail,
    subject: `Update on ${event.payload.organizationName} publication`,
    text: lines.join("\n"),
    html: brandedEmailShell(
      "Publication request needs an update",
      [
        `Hi ${escapeHtml(event.payload.recipientName)},`,
        `The publication request for <strong>${escapeHtml(event.payload.organizationName)}</strong> needs an update.`,
        `<strong>Reason:</strong> ${escapeHtml(event.payload.rejectionReason)}`,
        "You can fix the setup and submit a new publication request.",
        ...(supportLine(supportEmail)
          ? [escapeHtml(supportLine(supportEmail) as string)]
          : []),
      ],
      settingsUrl
        ? { label: "Review publication settings", url: settingsUrl }
        : undefined,
    ),
  };
}

export function renderUnpublishedEmail(
  event: Extract<
    ValidatedPublicationEvent,
    { eventType: "organization.unpublished" }
  >,
  settingsUrl?: string,
  supportEmail?: string,
): RenderedEmail {
  const lines = withSupport(
    [
      `Hi ${event.payload.recipientName},`,
      "",
      `${event.payload.organizationName}'s public booking page is no longer live.`,
      `Reason: ${event.payload.reason}`,
      "Your business configuration has not been deleted. After addressing the reason, an Owner can submit a new publication request.",
    ],
    supportEmail,
  );
  return {
    to: event.payload.recipientEmail,
    subject: `${event.payload.organizationName} booking page is no longer live`,
    text: lines.join("\n"),
    html: brandedEmailShell(
      "Your booking page is no longer live",
      [
        `Hi ${escapeHtml(event.payload.recipientName)},`,
        `<strong>${escapeHtml(event.payload.organizationName)}</strong>'s public booking page is no longer live.`,
        `<strong>Reason:</strong> ${escapeHtml(event.payload.reason)}`,
        "Your business configuration has not been deleted. After addressing the reason, an Owner can submit a new publication request.",
        ...(supportLine(supportEmail)
          ? [escapeHtml(supportLine(supportEmail) as string)]
          : []),
      ],
      settingsUrl
        ? { label: "Review publication settings", url: settingsUrl }
        : undefined,
    ),
  };
}
