import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parsePublicationEventMessage } from "../../src/publication/event-schema.js";

function requested() {
  const requestId = randomUUID();
  return {
    eventId: randomUUID(),
    aggregateType: "organization_publication_request",
    aggregateId: requestId,
    eventType: "organization.publication_requested",
    occurredAt: new Date().toISOString(),
    payload: {
      requestId,
      recipientName: "Ari",
      recipientEmail: "ari@example.test",
      organizationId: randomUUID(),
      organizationName: "Cedar Studio",
      organizationSlug: "cedar-studio",
    },
  };
}

describe("publication event schema", () => {
  it("accepts publication request and unpublication events", () => {
    expect(parsePublicationEventMessage(JSON.stringify(requested())).ok).toBe(
      true,
    );
    const event = requested();
    const organizationId = event.payload.organizationId;
    expect(
      parsePublicationEventMessage(
        JSON.stringify({
          ...event,
          aggregateType: "organization",
          aggregateId: organizationId,
          eventType: "organization.unpublished",
          payload: {
            ...event.payload,
            unpublicationId: randomUUID(),
            reason: "Listing review required",
          },
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects aggregate mismatches, missing reasons, and unsupported events", () => {
    const mismatch = requested();
    mismatch.aggregateId = randomUUID();
    expect(
      parsePublicationEventMessage(JSON.stringify(mismatch)),
    ).toMatchObject({ ok: false, deadLetterReason: "invalid_payload" });

    const rejected = requested();
    rejected.eventType = "organization.publication_rejected";
    expect(
      parsePublicationEventMessage(JSON.stringify(rejected)),
    ).toMatchObject({ ok: false, deadLetterReason: "invalid_payload" });

    const unsupported = requested();
    unsupported.eventType = "organization.publication_deleted";
    expect(
      parsePublicationEventMessage(JSON.stringify(unsupported)),
    ).toMatchObject({ ok: false, deadLetterReason: "unsupported_event" });
  });
});
