import type { Pool } from "pg";
import type { TransactionalEmailService } from "../../bookings/email/email-service.js";
import { processWithIdempotency } from "../../bookings/idempotency.js";
import { PermanentEventError } from "../../messaging/reliable-consumer.js";
import type { PublicationEventHandler } from "../consumer.js";
import {
  type RenderedEmail,
  renderInternalPublicationRequestEmail,
  renderPublicationRejectedEmail,
  renderPublicationRequestedEmail,
  renderPublishedEmail,
  renderUnpublishedEmail,
} from "./templates.js";

export const PUBLICATION_EMAIL_CONSUMER_NAME = "publication-email-v1";

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
  email: RenderedEmail,
  idempotencyKey: string,
) {
  await emailService.send({ ...email, idempotencyKey });
}

export function createPublicationEmailHandler(
  options: HandlerOptions,
): PublicationEventHandler {
  return async (event) => {
    if (
      (event.eventType === "organization.unpublished" &&
        event.aggregateId !== event.payload.organizationId) ||
      (event.eventType !== "organization.unpublished" &&
        event.aggregateId !== event.payload.requestId)
    )
      throw new PermanentEventError("aggregate_id_mismatch");

    await processWithIdempotency({
      pool: options.pool,
      consumerName: PUBLICATION_EMAIL_CONSUMER_NAME,
      eventId: event.eventId,
      eventType: event.eventType,
      onFirstExecution: async () => {
        const key = `organization-publication-email/${event.eventId}`;
        const settingsUrl = url(
          options.appBaseUrl,
          `/app/${encodeURIComponent(event.payload.organizationId)}/settings`,
        );
        switch (event.eventType) {
          case "organization.publication_requested":
            await send(
              options.emailService,
              renderPublicationRequestedEmail(
                event,
                settingsUrl,
                options.supportEmail,
              ),
              `${key}/recipient`,
            );
            await send(
              options.emailService,
              renderInternalPublicationRequestEmail(
                event,
                options.platformNotificationEmail,
                url(
                  options.appBaseUrl,
                  `/platform/publications?request=${encodeURIComponent(event.payload.requestId)}`,
                ),
              ),
              `${key}/internal`,
            );
            return { outcome: "recipient_and_internal_emails_sent" };
          case "organization.published":
            await send(
              options.emailService,
              renderPublishedEmail(
                event,
                url(
                  options.appBaseUrl,
                  `/book/${encodeURIComponent(event.payload.organizationSlug)}`,
                ),
                options.supportEmail,
              ),
              `${key}/recipient`,
            );
            return { outcome: "recipient_email_sent" };
          case "organization.publication_rejected":
            await send(
              options.emailService,
              renderPublicationRejectedEmail(
                event,
                settingsUrl,
                options.supportEmail,
              ),
              `${key}/recipient`,
            );
            return { outcome: "recipient_email_sent" };
          case "organization.unpublished":
            await send(
              options.emailService,
              renderUnpublishedEmail(event, settingsUrl, options.supportEmail),
              `${key}/recipient`,
            );
            return { outcome: "recipient_email_sent" };
        }
      },
    });
  };
}
