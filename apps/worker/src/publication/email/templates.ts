import {
  brandedEmailShell,
  escapeHtml,
  supportHtml,
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
        ...(supportHtml(supportEmail)
          ? [supportHtml(supportEmail) as string]
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
        ...(supportHtml(supportEmail)
          ? [supportHtml(supportEmail) as string]
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
        ...(supportHtml(supportEmail)
          ? [supportHtml(supportEmail) as string]
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
        ...(supportHtml(supportEmail)
          ? [supportHtml(supportEmail) as string]
          : []),
      ],
      settingsUrl
        ? { label: "Review publication settings", url: settingsUrl }
        : undefined,
    ),
  };
}

function formatLifecycleTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(value));
}

export function renderManuallyProvisionedEmail(
  event: Extract<
    ValidatedPublicationEvent,
    { eventType: "organization.manually_provisioned" }
  >,
  appUrl?: string,
  supportEmail?: string,
): RenderedEmail {
  const message = event.payload.customerMessage
    ? ["", "A message from the Schedlane team:", event.payload.customerMessage]
    : [];
  const lines = withSupport(
    [
      `Hi ${event.payload.recipientName},`,
      "",
      `The Schedlane team created the ${event.payload.organizationName} workspace for you.`,
      "You are its Owner. The workspace is currently unpublished, so you can configure Services, Resources, Schedule, Team, and Settings before requesting publication.",
      ...message,
    ],
    supportEmail,
  );
  if (appUrl) lines.push("", "Open Schedlane:", appUrl);
  return {
    to: event.payload.recipientEmail,
    subject: `Your ${event.payload.organizationName} workspace is ready`,
    text: lines.join("\n"),
    html: brandedEmailShell(
      "Your workspace has been created",
      [
        `Hi ${escapeHtml(event.payload.recipientName)},`,
        `The Schedlane team created the <strong>${escapeHtml(event.payload.organizationName)}</strong> workspace for you.`,
        "You are its Owner. The workspace is currently unpublished, so you can configure Services, Resources, Schedule, Team, and Settings before requesting publication.",
        ...(event.payload.customerMessage
          ? [
              `<strong>A message from the Schedlane team:</strong><br>${escapeHtml(event.payload.customerMessage)}`,
            ]
          : []),
        ...(supportHtml(supportEmail)
          ? [supportHtml(supportEmail) as string]
          : []),
      ],
      appUrl ? { label: "Open Schedlane", url: appUrl } : undefined,
    ),
  };
}

export function renderSuspendedEmail(
  event: Extract<
    ValidatedPublicationEvent,
    { eventType: "organization.suspended" }
  >,
  supportEmail?: string,
): RenderedEmail {
  const effective = formatLifecycleTime(event.occurredAt);
  const lines = [
    `Hi ${event.payload.recipientName},`,
    "",
    `The ${event.payload.organizationName} workspace was suspended by Schedlane on ${effective}.`,
    `Reason: ${event.payload.reason}`,
    "",
    "What this means:",
    "- The workspace is currently read-only.",
    "- Public booking access is unavailable while suspended.",
    "- Existing data and configuration have not been deleted.",
    ...(supportLine(supportEmail)
      ? ["", supportLine(supportEmail) as string]
      : []),
  ];
  return {
    to: event.payload.recipientEmail,
    subject: "Your Schedlane workspace has been suspended",
    text: lines.join("\n"),
    html: brandedEmailShell(
      "Your Schedlane workspace has been suspended",
      [
        `Hi ${escapeHtml(event.payload.recipientName)},`,
        `The <strong>${escapeHtml(event.payload.organizationName)}</strong> workspace was suspended by Schedlane on ${escapeHtml(effective)}.`,
        `<strong>Reason:</strong> ${escapeHtml(event.payload.reason)}`,
        "<strong>What this means:</strong><br>â€¢ The workspace is currently read-only.<br>â€¢ Public booking access is unavailable while suspended.<br>â€¢ Existing data and configuration have not been deleted.",
        ...(supportHtml(supportEmail)
          ? [supportHtml(supportEmail) as string]
          : []),
      ],
      supportEmail
        ? { label: "Contact Schedlane", url: `mailto:${supportEmail}` }
        : undefined,
    ),
  };
}

export function renderUnsuspendedEmail(
  event: Extract<
    ValidatedPublicationEvent,
    { eventType: "organization.unsuspended" }
  >,
  appUrl?: string,
  supportEmail?: string,
): RenderedEmail {
  const effective = formatLifecycleTime(event.occurredAt);
  const lines = withSupport(
    [
      `Hi ${event.payload.recipientName},`,
      "",
      `${event.payload.organizationName} is active again as of ${effective}.`,
      "You can manage the workspace again. Your existing publication and booking-page settings were preserved.",
    ],
    supportEmail,
  );
  if (appUrl) lines.push("", "Open Schedlane:", appUrl);
  return {
    to: event.payload.recipientEmail,
    subject: "Your Schedlane workspace is active again",
    text: lines.join("\n"),
    html: brandedEmailShell(
      "Your Schedlane workspace is active again",
      [
        `Hi ${escapeHtml(event.payload.recipientName)},`,
        `<strong>${escapeHtml(event.payload.organizationName)}</strong> is active again as of ${escapeHtml(effective)}.`,
        "You can manage the workspace again. Your existing publication and booking-page settings were preserved.",
        ...(supportHtml(supportEmail)
          ? [supportHtml(supportEmail) as string]
          : []),
      ],
      appUrl ? { label: "Open Schedlane", url: appUrl } : undefined,
    ),
  };
}
