import type { Pool } from "pg";
import type { TransactionalEmailService } from "../../bookings/email/email-service.js";
import { processWithIdempotency } from "../../bookings/idempotency.js";
import { PermanentEventError } from "../../messaging/reliable-consumer.js";
import type { OrganizationRequestEventHandler } from "../consumer.js";
import {
  type RenderedEmail,
  renderInternalRequestEmail,
  renderRequestApprovedEmail,
  renderRequestReceivedEmail,
  renderRequestRejectedEmail,
} from "./templates.js";

export const ORGANIZATION_REQUEST_EMAIL_CONSUMER_NAME =
  "organization-request-email-v1";

type HandlerOptions = {
  pool: Pool;
  emailService: TransactionalEmailService;
  platformNotificationEmail: string;
  appBaseUrl?: string | undefined;
  supportEmail?: string | undefined;
};

function url(baseUrl: string | undefined, path: string): string | undefined {
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : undefined;
}

async function send(
  emailService: TransactionalEmailService,
  rendered: RenderedEmail,
  idempotencyKey: string,
) {
  await emailService.send({ ...rendered, idempotencyKey });
}

export function createOrganizationRequestEmailHandler(
  options: HandlerOptions,
): OrganizationRequestEventHandler {
  return async (event) => {
    if (event.aggregateId !== event.payload.requestId) {
      throw new PermanentEventError("aggregate_id_mismatch");
    }

    await processWithIdempotency({
      pool: options.pool,
      consumerName: ORGANIZATION_REQUEST_EMAIL_CONSUMER_NAME,
      eventId: event.eventId,
      eventType: event.eventType,
      onFirstExecution: async () => {
        const key = `organization-request-email/${event.eventId}`;
        switch (event.eventType) {
          case "organization_request.submitted":
            await send(
              options.emailService,
              renderRequestReceivedEmail(event, options.supportEmail),
              `${key}/applicant`,
            );
            await send(
              options.emailService,
              renderInternalRequestEmail(
                event,
                options.platformNotificationEmail,
                url(
                  options.appBaseUrl,
                  `/platform/requests?request=${encodeURIComponent(event.payload.requestId)}`,
                ),
              ),
              `${key}/internal`,
            );
            return { outcome: "applicant_and_internal_emails_sent" };

          case "organization_request.approved":
            await send(
              options.emailService,
              renderRequestApprovedEmail(
                event,
                url(options.appBaseUrl, "/app"),
                options.supportEmail,
              ),
              `${key}/applicant`,
            );
            return { outcome: "applicant_email_sent" };

          case "organization_request.rejected":
            await send(
              options.emailService,
              renderRequestRejectedEmail(
                event,
                url(options.appBaseUrl, "/app"),
                options.supportEmail,
              ),
              `${key}/applicant`,
            );
            return { outcome: "applicant_email_sent" };
        }
      },
    });
  };
}
