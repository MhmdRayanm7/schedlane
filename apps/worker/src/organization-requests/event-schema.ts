type SubmittedPayload = {
  requestId: string;
  applicantName: string;
  applicantEmail: string;
  organizationName: string;
  description: string;
  contactPhone: string | null;
  additionalContext: string | null;
  wantsSetupHelp: boolean;
};

type ApprovedPayload = {
  requestId: string;
  applicantName: string;
  applicantEmail: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

type RejectedPayload = {
  requestId: string;
  applicantName: string;
  applicantEmail: string;
  organizationName: string;
  rejectionReason: string;
};

type Event<TType extends string, TPayload> = {
  eventId: string;
  aggregateType: "organization_request";
  aggregateId: string;
  eventType: TType;
  occurredAt: string;
  payload: TPayload;
};

export type ValidatedOrganizationRequestEvent =
  | Event<"organization_request.submitted", SubmittedPayload>
  | Event<"organization_request.approved", ApprovedPayload>
  | Event<"organization_request.rejected", RejectedPayload>;

export type ParseOrganizationRequestEventResult =
  | { ok: true; event: ValidatedOrganizationRequestEvent }
  | { ok: false; deadLetterReason: string };

function string(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function commonPayload(payload: Record<string, unknown>, aggregateId: string) {
  return (
    payload.requestId === aggregateId &&
    string(payload.applicantName) &&
    string(payload.applicantEmail) &&
    string(payload.organizationName)
  );
}

export function parseOrganizationRequestEventMessage(
  raw: Buffer | string,
): ParseOrganizationRequestEventResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
  } catch {
    return { ok: false, deadLetterReason: "invalid_json" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, deadLetterReason: "invalid_envelope" };
  }
  const envelope = parsed as Record<string, unknown>;
  if (
    !string(envelope.eventId) ||
    envelope.aggregateType !== "organization_request" ||
    !string(envelope.aggregateId) ||
    !string(envelope.eventType) ||
    !string(envelope.occurredAt) ||
    !Number.isFinite(Date.parse(envelope.occurredAt)) ||
    !envelope.payload ||
    typeof envelope.payload !== "object" ||
    Array.isArray(envelope.payload)
  ) {
    return { ok: false, deadLetterReason: "invalid_envelope" };
  }

  const payload = envelope.payload as Record<string, unknown>;
  if (!commonPayload(payload, envelope.aggregateId)) {
    return { ok: false, deadLetterReason: "invalid_payload" };
  }

  switch (envelope.eventType) {
    case "organization_request.submitted":
      if (
        !string(payload.description) ||
        !nullableString(payload.contactPhone) ||
        !nullableString(payload.additionalContext) ||
        typeof payload.wantsSetupHelp !== "boolean"
      ) {
        return { ok: false, deadLetterReason: "invalid_payload" };
      }
      break;
    case "organization_request.approved":
      if (
        !string(payload.organizationId) ||
        !string(payload.organizationSlug)
      ) {
        return { ok: false, deadLetterReason: "invalid_payload" };
      }
      break;
    case "organization_request.rejected":
      if (!string(payload.rejectionReason)) {
        return { ok: false, deadLetterReason: "invalid_payload" };
      }
      break;
    default:
      return { ok: false, deadLetterReason: "unsupported_event" };
  }

  return {
    ok: true,
    event: envelope as ValidatedOrganizationRequestEvent,
  };
}
