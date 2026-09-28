import { describe, expect, it } from "vitest";
import {
  renderManuallyProvisionedEmail,
  renderSuspendedEmail,
  renderUnsuspendedEmail,
} from "../../src/publication/email/templates.js";
import type { ValidatedPublicationEvent } from "../../src/publication/event-schema.js";

const common = {
  eventId: "event-id",
  aggregateType: "organization" as const,
  aggregateId: "organization-id",
  occurredAt: "2026-09-29T09:00:00.000Z",
  payload: {
    organizationId: "organization-id",
    organizationName: "Calm <Studio>",
    organizationSlug: "calm-studio",
    recipientName: "Ari & Lee",
    recipientEmail: "owner@example.test",
  },
};

describe("organization lifecycle email templates", () => {
  it("renders suspension meaning, reason, support, and escaped HTML", () => {
    const event = {
      ...common,
      eventType: "organization.suspended" as const,
      payload: { ...common.payload, reason: "Review <required>" },
    } satisfies Extract<
      ValidatedPublicationEvent,
      { eventType: "organization.suspended" }
    >;
    const email = renderSuspendedEmail(event, "support@example.test");
    expect(email.to).toBe("owner@example.test");
    expect(email.text).toContain("Review <required>");
    expect(email.text).toContain("read-only");
    expect(email.text).toContain("Public booking access is unavailable");
    expect(email.html).toContain("mailto:support@example.test");
    expect(email.html).toContain("Review &lt;required&gt;");
    expect(email.html).not.toContain("Review <required>");
  });

  it("renders unsuspension without promising that the booking page is live", () => {
    const email = renderUnsuspendedEmail(
      {
        ...common,
        eventType: "organization.unsuspended",
      },
      "https://schedlane.test/app",
      "support@example.test",
    );
    expect(email.text).toContain("active again");
    expect(email.text).toContain(
      "publication and booking-page settings were preserved",
    );
    expect(email.text).not.toContain("booking page is live");
    expect(email.html).toContain("Open Schedlane");
  });

  it("renders manual provisioning with only the customer-facing message", () => {
    const email = renderManuallyProvisionedEmail(
      {
        ...common,
        eventType: "organization.manually_provisioned",
        payload: {
          ...common.payload,
          customerMessage: "Welcome <owner>",
        },
      },
      "https://schedlane.test/app",
      "support@example.test",
    );
    expect(email.text).toContain("currently unpublished");
    expect(email.text).toContain(
      "Services, Resources, Schedule, Team, and Settings",
    );
    expect(email.text).toContain("Welcome <owner>");
    expect(email.html).toContain("Welcome &lt;owner&gt;");
    expect(email.html).toContain("Open Schedlane");
  });
});
