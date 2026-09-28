import { db } from "../../../db.js";
import { insertOutboxEventInTransaction } from "../../../outbox/persistence.js";
import {
  type OrganizationRequestSubmittedPayload,
  organizationRequestEventTypes,
} from "../domain/request-events.js";

type CreateOrganizationRequestInput = {
  requestedByUserId: string;
  name: string;
  description: string;
  contactPhone?: string | undefined;
  additionalContext?: string | undefined;
  wantsSetupHelp: boolean;
};

export type CreateOrganizationRequestResult =
  | {
      ok: true;
      request: {
        id: string;
        name: string;
        description: string;
        contactPhone: string | null;
        additionalContext: string | null;
        wantsSetupHelp: boolean;
        status: "pending";
        createdAt: string;
      };
    }
  | { ok: false; reason: "pending_request_exists" };

function optionalTrimmed(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createOrganizationRequest(
  input: CreateOrganizationRequestInput,
): Promise<CreateOrganizationRequestResult> {
  const name = input.name.trim();
  const description = input.description.trim();
  const contactPhone = optionalTrimmed(input.contactPhone);
  const additionalContext = optionalTrimmed(input.additionalContext);

  return db.transaction().execute(async (trx) => {
    const applicant = await trx
      .selectFrom("user")
      .select(["id", "name", "email"])
      .where("id", "=", input.requestedByUserId)
      .forUpdate()
      .executeTakeFirstOrThrow();

    const pendingRequest = await trx
      .selectFrom("organization_request")
      .select("id")
      .where("requested_by_user_id", "=", applicant.id)
      .where("status", "=", "pending")
      .executeTakeFirst();

    if (pendingRequest) {
      return { ok: false, reason: "pending_request_exists" };
    }

    const request = await trx
      .insertInto("organization_request")
      .values({
        requested_by_user_id: applicant.id,
        name,
        description,
        contact_phone: contactPhone,
        additional_context: additionalContext,
        wants_setup_help: input.wantsSetupHelp,
      })
      .returning([
        "id",
        "name",
        "description",
        "contact_phone",
        "additional_context",
        "wants_setup_help",
        "status",
        "created_at",
      ])
      .executeTakeFirstOrThrow();

    await insertOutboxEventInTransaction<
      typeof organizationRequestEventTypes.submitted,
      OrganizationRequestSubmittedPayload
    >(trx, {
      aggregateType: "organization_request",
      aggregateId: request.id,
      eventType: organizationRequestEventTypes.submitted,
      payload: {
        requestId: request.id,
        applicantName: applicant.name,
        applicantEmail: applicant.email,
        organizationName: request.name,
        description,
        contactPhone,
        additionalContext,
        wantsSetupHelp: request.wants_setup_help,
      },
      occurredAt: request.created_at,
    });

    return {
      ok: true,
      request: {
        id: request.id,
        name: request.name,
        description,
        contactPhone,
        additionalContext,
        wantsSetupHelp: request.wants_setup_help,
        status: "pending",
        createdAt: request.created_at.toISOString(),
      },
    };
  });
}
