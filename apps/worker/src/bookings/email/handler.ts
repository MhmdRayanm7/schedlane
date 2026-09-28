import type pg from "pg";
import type { BookingEventHandler } from "../consumer.js";
import { PermanentEventError } from "../consumer.js";
import type { ValidatedBookingEvent } from "../event-schema.js";
import {
  BOOKING_EMAIL_CONSUMER_NAME,
  processWithIdempotency,
} from "../idempotency.js";
import type { TransactionalEmailService } from "./email-service.js";
import {
  buildGuestManagementUrl,
  decryptGuestManagementToken,
} from "./guest-management-link.js";
import {
  type BookingEmailContext,
  type RenderedEmail,
  renderBookingCancelledEmail,
  renderBookingCreatedEmail,
  renderBookingRescheduledEmail,
} from "./templates.js";

export interface BookingEmailHandlerOptions {
  pool: pg.Pool;
  emailService: TransactionalEmailService;
  encryptionKey?: string | Buffer | undefined;
  guestBookingManagementUrl?: string | undefined;
  appBaseUrl?: string | undefined;
}

function appUrl(baseUrl: string | undefined, path: string) {
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : null;
}

export function createBookingEmailHandler(
  options: BookingEmailHandlerOptions,
): BookingEventHandler {
  const {
    pool,
    emailService,
    encryptionKey,
    guestBookingManagementUrl,
    appBaseUrl,
  } = options;

  return async (event: ValidatedBookingEvent) => {
    if (event.aggregateId !== event.payload.bookingId) {
      throw new PermanentEventError("aggregate_id_mismatch");
    }

    await processWithIdempotency({
      pool,
      consumerName: BOOKING_EMAIL_CONSUMER_NAME,
      eventId: event.eventId,
      eventType: event.eventType,
      onFirstExecution: async (client) => {
        if (!event.payload.guestEmail) {
          return { outcome: "skipped_no_email" };
        }

        const bookingResult = await client.query<{
          guest_management_token_encrypted: string | null;
          organization_name: string;
          organization_slug: string;
          resource_name: string | null;
          service_name: string;
        }>(
          `SELECT
             booking.guest_management_token_encrypted,
             organization.name AS organization_name,
             organization.slug AS organization_slug,
             resource.name AS resource_name,
             service.name AS service_name
           FROM booking
           JOIN organization ON organization.id = booking.organization_id
           LEFT JOIN resource ON resource.id = booking.resource_id
             AND resource.organization_id = booking.organization_id
           JOIN service ON service.id = booking.service_id
             AND service.organization_id = booking.organization_id
           WHERE booking.id = $1`,
          [event.payload.bookingId],
        );

        if (bookingResult.rows.length === 0) {
          throw new PermanentEventError("booking_not_found");
        }

        const encryptedToken =
          bookingResult.rows[0]?.guest_management_token_encrypted;
        let managementUrl: string | null = null;

        if (encryptedToken && event.eventType !== "booking.cancelled") {
          if (!encryptionKey) {
            throw new PermanentEventError(
              "missing_token_encryption_key_config",
            );
          }
          if (!guestBookingManagementUrl) {
            throw new PermanentEventError(
              "missing_guest_booking_management_url_config",
            );
          }

          const rawToken = decryptGuestManagementToken(
            encryptedToken,
            encryptionKey,
          );
          managementUrl = buildGuestManagementUrl(
            guestBookingManagementUrl,
            rawToken,
          );
        }

        let rendered: RenderedEmail;
        const bookingContext: BookingEmailContext = {
          organizationName: bookingResult.rows[0]?.organization_name ?? "",
          organizationSlug: bookingResult.rows[0]?.organization_slug ?? "",
          resourceName: bookingResult.rows[0]?.resource_name ?? "",
          serviceName: bookingResult.rows[0]?.service_name ?? "",
        };
        switch (event.eventType) {
          case "booking.created":
            rendered = renderBookingCreatedEmail(
              event,
              managementUrl,
              bookingContext,
            );
            break;
          case "booking.rescheduled":
            rendered = renderBookingRescheduledEmail(
              event,
              managementUrl,
              bookingContext,
            );
            break;
          case "booking.cancelled":
            rendered = renderBookingCancelledEmail(
              event,
              appUrl(
                appBaseUrl,
                `/book/${encodeURIComponent(bookingContext.organizationSlug)}`,
              ),
              bookingContext,
            );
            break;
        }

        const idempotencyKey = `booking-email/${event.eventId}`;

        await emailService.send({
          to: rendered.to,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          idempotencyKey,
        });

        return { outcome: "email_sent" };
      },
    });
  };
}
