import {
  brandedEmailShell,
  escapeHtml,
  supportHtml,
  supportLine,
} from "../../email/branded-template.js";
import type { ValidatedOrganizationRequestEvent } from "../event-schema.js";

export type RenderedEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function renderRequestReceivedEmail(
  event: Extract<
    ValidatedOrganizationRequestEvent,
    { eventType: "organization_request.submitted" }
  >,
  supportEmail?: string,
): RenderedEmail {
  const lines = [
    `Hi ${event.payload.applicantName},`,
    "",
    `We received your request for ${event.payload.organizationName}.`,
    "Our team will review the information you shared. Submitting a request does not guarantee approval, and we'll let you know when a decision is made.",
    ...(supportLine(supportEmail)
      ? ["", supportLine(supportEmail) as string]
      : []),
  ];
  const paragraphs = [
    `Hi ${escapeHtml(event.payload.applicantName)},`,
    `We received your request for <strong>${escapeHtml(event.payload.organizationName)}</strong>.`,
    "Our team will review the information you shared. Submitting a request does not guarantee approval, and we'll let you know when a decision is made.",
    ...(supportHtml(supportEmail) ? [supportHtml(supportEmail) as string] : []),
  ];
  return {
    to: event.payload.applicantEmail,
    subject: `We received your ${event.payload.organizationName} request`,
    text: lines.join("\n"),
    html: brandedEmailShell("Request received", paragraphs),
  };
}

export function renderInternalRequestEmail(
  event: Extract<
    ValidatedOrganizationRequestEvent,
    { eventType: "organization_request.submitted" }
  >,
  to: string,
  platformUrl?: string,
): RenderedEmail {
  const details = [
    `Applicant: ${event.payload.applicantName} (${event.payload.applicantEmail})`,
    `Organization: ${event.payload.organizationName}`,
    `Description: ${event.payload.description}`,
    `Phone / WhatsApp: ${event.payload.contactPhone ?? "Not provided"}`,
    `Additional context: ${event.payload.additionalContext ?? "Not provided"}`,
    `Setup help requested: ${event.payload.wantsSetupHelp ? "Yes" : "No"}`,
    `Request ID: ${event.payload.requestId}`,
  ];
  if (platformUrl) details.push("", "Review request:", platformUrl);
  return {
    to,
    subject: `Review request: ${event.payload.organizationName}`,
    text: details.join("\n"),
    html: brandedEmailShell(
      "Review organization request",
      details.filter(Boolean).map(escapeHtml),
      platformUrl ? { label: "Review request", url: platformUrl } : undefined,
    ),
  };
}

export function renderRequestApprovedEmail(
  event: Extract<
    ValidatedOrganizationRequestEvent,
    { eventType: "organization_request.approved" }
  >,
  appUrl?: string,
  supportEmail?: string,
): RenderedEmail {
  const lines = [
    `Hi ${event.payload.applicantName},`,
    "",
    `Your ${event.payload.organizationName} workspace has been created.`,
    "You are now its Owner and can configure your services, resources, schedule, and team. Your workspace is not public yet.",
  ];
  if (appUrl) lines.push("", "Open Schedlane:", appUrl);
  if (supportLine(supportEmail))
    lines.push("", supportLine(supportEmail) as string);
  return {
    to: event.payload.applicantEmail,
    subject: `Your ${event.payload.organizationName} workspace is ready`,
    text: lines.join("\n"),
    html: brandedEmailShell(
      "Your workspace is ready",
      [
        `Hi ${escapeHtml(event.payload.applicantName)},`,
        `Your <strong>${escapeHtml(event.payload.organizationName)}</strong> workspace has been created.`,
        "You are now its Owner and can configure your services, resources, schedule, and team. Your workspace is not public yet.",
        ...(supportHtml(supportEmail)
          ? [supportHtml(supportEmail) as string]
          : []),
      ],
      appUrl ? { label: "Open Schedlane", url: appUrl } : undefined,
    ),
  };
}

export function renderRequestRejectedEmail(
  event: Extract<
    ValidatedOrganizationRequestEvent,
    { eventType: "organization_request.rejected" }
  >,
  appUrl?: string,
  supportEmail?: string,
): RenderedEmail {
  const lines = [
    `Hi ${event.payload.applicantName},`,
    "",
    `We weren't able to approve your request for ${event.payload.organizationName}.`,
    `Reason: ${event.payload.rejectionReason}`,
    "You may update the information and submit a new request.",
  ];
  if (appUrl) lines.push("", "Return to Schedlane:", appUrl);
  if (supportLine(supportEmail))
    lines.push("", supportLine(supportEmail) as string);
  return {
    to: event.payload.applicantEmail,
    subject: `Update on your ${event.payload.organizationName} request`,
    text: lines.join("\n"),
    html: brandedEmailShell(
      "An update on your request",
      [
        `Hi ${escapeHtml(event.payload.applicantName)},`,
        `We weren't able to approve your request for <strong>${escapeHtml(event.payload.organizationName)}</strong>.`,
        `<strong>Reason:</strong> ${escapeHtml(event.payload.rejectionReason)}`,
        "You may update the information and submit a new request.",
        ...(supportHtml(supportEmail)
          ? [supportHtml(supportEmail) as string]
          : []),
      ],
      appUrl ? { label: "Return to Schedlane", url: appUrl } : undefined,
    ),
  };
}
