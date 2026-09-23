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
}

export function createBookingEmailHandler(
  options: BookingEmailHandlerOptions,
): BookingEventHandler {
  const { pool, emailService, encryptionKey, guestBookingManagementUrl } =
    options;

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
        }>(
          `SELECT guest_management_token_encrypted FROM booking WHERE id = $1`,
          [event.payload.bookingId],
        );

        if (bookingResult.rows.length === 0) {
          throw new PermanentEventError("booking_not_found");
        }

        const encryptedToken =
          bookingResult.rows[0]?.guest_management_token_encrypted;
        let managementUrl: string | null = null;

        if (encryptedToken) {
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
        switch (event.eventType) {
          case "booking.created":
            rendered = renderBookingCreatedEmail(event, managementUrl);
            break;
          case "booking.rescheduled":
            rendered = renderBookingRescheduledEmail(event, managementUrl);
            break;
          case "booking.cancelled":
            rendered = renderBookingCancelledEmail(event, managementUrl);
            break;
        }

        const idempotencyKey = `booking-email/${event.eventId}`;

        await emailService.send({
          to: rendered.to,
          subject: rendered.subject,
          text: rendered.text,
          idempotencyKey,
        });

        return { outcome: "email_sent" };
      },
    });
  };
}
