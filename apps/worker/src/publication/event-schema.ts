type PublicationRecipientPayload = {
  recipientName: string;
  recipientEmail: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

type RequestPayload = PublicationRecipientPayload & { requestId: string };
type RejectedPayload = RequestPayload & { rejectionReason: string };
type UnpublishedPayload = PublicationRecipientPayload & {
  unpublicationId: string;
  reason: string;
};

type PublicationRequestEvent<TType extends string, TPayload> = {
  eventId: string;
  aggregateType: "organization_publication_request";
  aggregateId: string;
  eventType: TType;
  occurredAt: string;
  payload: TPayload;
};

type OrganizationEvent<TType extends string, TPayload> = {
  eventId: string;
  aggregateType: "organization";
  aggregateId: string;
  eventType: TType;
  occurredAt: string;
  payload: TPayload;
};

export type ValidatedPublicationEvent =
  | PublicationRequestEvent<
      "organization.publication_requested",
      RequestPayload
    >
  | PublicationRequestEvent<"organization.published", RequestPayload>
  | PublicationRequestEvent<
      "organization.publication_rejected",
      RejectedPayload
    >
  | OrganizationEvent<"organization.unpublished", UnpublishedPayload>;

export type ParsePublicationEventResult =
  | { ok: true; event: ValidatedPublicationEvent }
  | { ok: false; deadLetterReason: string };

function string(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parsePublicationEventMessage(
  raw: Buffer | string,
): ParsePublicationEventResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
  } catch {
    return { ok: false, deadLetterReason: "invalid_json" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return { ok: false, deadLetterReason: "invalid_envelope" };
  const envelope = parsed as Record<string, unknown>;
  if (
    !string(envelope.eventId) ||
    !string(envelope.aggregateId) ||
    !string(envelope.eventType) ||
    !string(envelope.occurredAt) ||
    !Number.isFinite(Date.parse(envelope.occurredAt)) ||
    !envelope.payload ||
    typeof envelope.payload !== "object" ||
    Array.isArray(envelope.payload)
  )
    return { ok: false, deadLetterReason: "invalid_envelope" };
  const payload = envelope.payload as Record<string, unknown>;
  if (
    !string(payload.recipientName) ||
    !string(payload.recipientEmail) ||
    !string(payload.organizationId) ||
    !string(payload.organizationName) ||
    !string(payload.organizationSlug)
  )
    return { ok: false, deadLetterReason: "invalid_payload" };

  switch (envelope.eventType) {
    case "organization.publication_requested":
    case "organization.published":
      if (
        envelope.aggregateType !== "organization_publication_request" ||
        !string(payload.requestId) ||
        payload.requestId !== envelope.aggregateId
      )
        return { ok: false, deadLetterReason: "invalid_payload" };
      break;
    case "organization.publication_rejected":
      if (
        envelope.aggregateType !== "organization_publication_request" ||
        !string(payload.requestId) ||
        payload.requestId !== envelope.aggregateId ||
        !string(payload.rejectionReason)
      )
        return { ok: false, deadLetterReason: "invalid_payload" };
      break;
    case "organization.unpublished":
      if (
        envelope.aggregateType !== "organization" ||
        payload.organizationId !== envelope.aggregateId ||
        !string(payload.unpublicationId) ||
        !string(payload.reason)
      )
        return { ok: false, deadLetterReason: "invalid_payload" };
      break;
    default:
      return { ok: false, deadLetterReason: "unsupported_event" };
  }
  return { ok: true, event: envelope as ValidatedPublicationEvent };
}
