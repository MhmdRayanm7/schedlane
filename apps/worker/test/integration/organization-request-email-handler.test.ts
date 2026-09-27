import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type {
  SendTransactionalEmailInput,
  TransactionalEmailService,
} from "../../src/bookings/email/email-service.js";
import {
  createOrganizationRequestEmailHandler,
  ORGANIZATION_REQUEST_EMAIL_CONSUMER_NAME,
} from "../../src/organization-requests/email/handler.js";
import type { ValidatedOrganizationRequestEvent } from "../../src/organization-requests/event-schema.js";
import { startWorkerTestInfrastructure } from "../helpers/test-infrastructure.js";

class FakeEmailService implements TransactionalEmailService {
  sent: SendTransactionalEmailInput[] = [];
  failAt: number | null = null;

  async send(input: SendTransactionalEmailInput) {
    this.sent.push(input);
    if (this.failAt === this.sent.length)
      throw new Error("provider unavailable");
    return { id: `email-${this.sent.length}` };
  }
}

const infra = await startWorkerTestInfrastructure();
beforeEach(() => infra.reset());
afterAll(() => infra.stop());

function submittedEvent(): Extract<
  ValidatedOrganizationRequestEvent,
  { eventType: "organization_request.submitted" }
> {
  const requestId = randomUUID();
  return {
    eventId: randomUUID(),
    aggregateType: "organization_request",
    aggregateId: requestId,
    eventType: "organization_request.submitted",
    occurredAt: new Date().toISOString(),
    payload: {
      requestId,
      applicantName: "Ari Cohen",
      applicantEmail: "ari@example.test",
      organizationName: "Cedar Studio",
      description: "Appointment scheduling for a small design studio.",
      contactPhone: "+972501234567",
      additionalContext: "Three staff members",
      wantsSetupHelp: true,
    },
  };
}

function handler(emailService: TransactionalEmailService) {
  return createOrganizationRequestEmailHandler({
    pool: infra.pool,
    emailService,
    platformNotificationEmail: "reviews@schedlane.test",
    supportEmail: "support@schedlane.test",
    appBaseUrl: "https://app.schedlane.test",
  });
}

describe("organization request email handler", () => {
  it("sends applicant and internal submission emails with deterministic keys", async () => {
    const emailService = new FakeEmailService();
    const event = submittedEvent();
    const handle = handler(emailService);

    await handle(event);
    await handle(event);

    expect(emailService.sent).toHaveLength(2);
    expect(emailService.sent[0]).toMatchObject({
      to: "ari@example.test",
      idempotencyKey: `organization-request-email/${event.eventId}/applicant`,
    });
    expect(emailService.sent[0]?.text).toContain("does not guarantee approval");
    expect(emailService.sent[0]?.html).toContain("Schedlane");
    expect(emailService.sent[1]).toMatchObject({
      to: "reviews@schedlane.test",
      idempotencyKey: `organization-request-email/${event.eventId}/internal`,
    });
    expect(emailService.sent[1]?.text).toContain(event.payload.requestId);
    expect(emailService.sent[1]?.text).toContain(
      `/platform/requests?request=${event.payload.requestId}`,
    );

    const receipt = await infra.pool.query(
      "SELECT outcome FROM consumer_receipt WHERE consumer_name = $1 AND event_id = $2",
      [ORGANIZATION_REQUEST_EMAIL_CONSUMER_NAME, event.eventId],
    );
    expect(receipt.rows[0]?.outcome).toBe("applicant_and_internal_emails_sent");
  });

  it.each([
    {
      eventType: "organization_request.approved" as const,
      payload: {
        organizationId: randomUUID(),
        organizationSlug: "cedar-studio",
      },
      expected: "not public yet",
    },
    {
      eventType: "organization_request.rejected" as const,
      payload: { rejectionReason: "Please clarify the intended use." },
      expected: "Please clarify the intended use.",
    },
  ])(
    "sends the $eventType applicant email",
    async ({ eventType, payload, expected }) => {
      const emailService = new FakeEmailService();
      const requestId = randomUUID();
      const event = {
        eventId: randomUUID(),
        aggregateType: "organization_request" as const,
        aggregateId: requestId,
        eventType,
        occurredAt: new Date().toISOString(),
        payload: {
          requestId,
          applicantName: "Ari Cohen",
          applicantEmail: "ari@example.test",
          organizationName: "Cedar Studio",
          ...payload,
        },
      } as ValidatedOrganizationRequestEvent;

      await handler(emailService)(event);
      expect(emailService.sent).toHaveLength(1);
      expect(emailService.sent[0]?.text).toContain(expected);
      expect(emailService.sent[0]?.idempotencyKey).toBe(
        `organization-request-email/${event.eventId}/applicant`,
      );
    },
  );

  it("does not persist a receipt when the provider fails", async () => {
    const emailService = new FakeEmailService();
    emailService.failAt = 2;
    const event = submittedEvent();

    await expect(handler(emailService)(event)).rejects.toThrow(
      "provider unavailable",
    );
    const receipt = await infra.pool.query(
      "SELECT 1 FROM consumer_receipt WHERE consumer_name = $1 AND event_id = $2",
      [ORGANIZATION_REQUEST_EMAIL_CONSUMER_NAME, event.eventId],
    );
    expect(receipt.rowCount).toBe(0);
  });
});
