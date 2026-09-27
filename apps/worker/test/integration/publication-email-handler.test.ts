import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type {
  SendTransactionalEmailInput,
  TransactionalEmailService,
} from "../../src/bookings/email/email-service.js";
import {
  createPublicationEmailHandler,
  PUBLICATION_EMAIL_CONSUMER_NAME,
} from "../../src/publication/email/handler.js";
import type { ValidatedPublicationEvent } from "../../src/publication/event-schema.js";
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

function requestedEvent(): Extract<
  ValidatedPublicationEvent,
  { eventType: "organization.publication_requested" }
> {
  const requestId = randomUUID();
  return {
    eventId: randomUUID(),
    aggregateType: "organization_publication_request",
    aggregateId: requestId,
    eventType: "organization.publication_requested",
    occurredAt: new Date().toISOString(),
    payload: {
      requestId,
      recipientName: "Ari Cohen",
      recipientEmail: "ari@example.test",
      organizationId: randomUUID(),
      organizationName: "Cedar Studio",
      organizationSlug: "cedar-studio",
    },
  };
}

function handler(emailService: TransactionalEmailService) {
  return createPublicationEmailHandler({
    pool: infra.pool,
    emailService,
    platformNotificationEmail: "reviews@schedlane.test",
    supportEmail: "support@schedlane.test",
    appBaseUrl: "https://app.schedlane.test",
  });
}

describe("publication email handler", () => {
  it("sends requester and internal acknowledgement once with deterministic keys", async () => {
    const emailService = new FakeEmailService();
    const event = requestedEvent();
    const handle = handler(emailService);

    await handle(event);
    await handle(event);

    expect(emailService.sent).toHaveLength(2);
    expect(emailService.sent[0]).toMatchObject({
      to: "ari@example.test",
      idempotencyKey: `organization-publication-email/${event.eventId}/recipient`,
    });
    expect(emailService.sent[0]?.html).toContain("Schedlane");
    expect(emailService.sent[1]).toMatchObject({
      to: "reviews@schedlane.test",
      idempotencyKey: `organization-publication-email/${event.eventId}/internal`,
    });
    expect(emailService.sent[1]?.text).toContain(
      `/platform/publications?request=${event.payload.requestId}`,
    );

    const receipt = await infra.pool.query(
      "SELECT outcome FROM consumer_receipt WHERE consumer_name = $1 AND event_id = $2",
      [PUBLICATION_EMAIL_CONSUMER_NAME, event.eventId],
    );
    expect(receipt.rows[0]?.outcome).toBe("recipient_and_internal_emails_sent");
  });

  it.each([
    {
      eventType: "organization.published" as const,
      extra: {},
      expected: "/book/cedar-studio",
    },
    {
      eventType: "organization.publication_rejected" as const,
      extra: { rejectionReason: "Assign an active resource." },
      expected: "Assign an active resource.",
    },
  ])(
    "sends the $eventType owner email",
    async ({ eventType, extra, expected }) => {
      const emailService = new FakeEmailService();
      const base = requestedEvent();
      const event = {
        ...base,
        eventType,
        payload: { ...base.payload, ...extra },
      } as ValidatedPublicationEvent;
      await handler(emailService)(event);
      expect(emailService.sent).toHaveLength(1);
      expect(emailService.sent[0]?.text).toContain(expected);
      expect(emailService.sent[0]?.idempotencyKey).toBe(
        `organization-publication-email/${event.eventId}/recipient`,
      );
    },
  );

  it("explains unpublication without deleting configuration", async () => {
    const emailService = new FakeEmailService();
    const base = requestedEvent();
    const event: ValidatedPublicationEvent = {
      ...base,
      aggregateType: "organization",
      aggregateId: base.payload.organizationId,
      eventType: "organization.unpublished",
      payload: {
        recipientName: base.payload.recipientName,
        recipientEmail: base.payload.recipientEmail,
        organizationId: base.payload.organizationId,
        organizationName: base.payload.organizationName,
        organizationSlug: base.payload.organizationSlug,
        unpublicationId: randomUUID(),
        reason: "Public listing needs another review.",
      },
    };
    await handler(emailService)(event);
    expect(emailService.sent[0]?.text).toContain(
      "business configuration has not been deleted",
    );
    expect(emailService.sent[0]?.text).toContain(
      "Public listing needs another review.",
    );
  });

  it("does not persist a receipt when the provider fails", async () => {
    const emailService = new FakeEmailService();
    emailService.failAt = 2;
    const event = requestedEvent();
    await expect(handler(emailService)(event)).rejects.toThrow(
      "provider unavailable",
    );
    const receipt = await infra.pool.query(
      "SELECT 1 FROM consumer_receipt WHERE consumer_name = $1 AND event_id = $2",
      [PUBLICATION_EMAIL_CONSUMER_NAME, event.eventId],
    );
    expect(receipt.rowCount).toBe(0);
    expect(emailService.sent.map((email) => email.idempotencyKey)).toEqual([
      `organization-publication-email/${event.eventId}/recipient`,
      `organization-publication-email/${event.eventId}/internal`,
    ]);
  });
});
