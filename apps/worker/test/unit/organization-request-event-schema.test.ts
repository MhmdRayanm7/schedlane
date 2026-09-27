import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseOrganizationRequestEventMessage } from "../../src/organization-requests/event-schema.js";

function submitted() {
  const requestId = randomUUID();
  return {
    eventId: randomUUID(),
    aggregateType: "organization_request",
    aggregateId: requestId,
    eventType: "organization_request.submitted",
    occurredAt: new Date().toISOString(),
    payload: {
      requestId,
      applicantName: "Ari",
      applicantEmail: "ari@example.test",
      organizationName: "Cedar Studio",
      description: "Scheduling for client appointments.",
      contactPhone: null,
      additionalContext: null,
      wantsSetupHelp: false,
    },
  };
}

describe("organization request event schema", () => {
  it("accepts a valid submitted event", () => {
    expect(
      parseOrganizationRequestEventMessage(JSON.stringify(submitted())).ok,
    ).toBe(true);
  });

  it("rejects mismatched aggregate identifiers and unsupported events", () => {
    const mismatch = submitted();
    mismatch.aggregateId = randomUUID();
    expect(
      parseOrganizationRequestEventMessage(JSON.stringify(mismatch)),
    ).toEqual({
      ok: false,
      deadLetterReason: "invalid_payload",
    });

    const unsupported = submitted();
    unsupported.eventType = "organization_request.deleted";
    expect(
      parseOrganizationRequestEventMessage(JSON.stringify(unsupported)),
    ).toEqual({
      ok: false,
      deadLetterReason: "unsupported_event",
    });
  });
});
