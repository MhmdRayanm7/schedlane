import type pg from "pg";
import type { BookingEventHandler } from "../consumer.js";
import { PermanentEventError } from "../consumer.js";
import type {
  ValidatedBookingEvent,
  ValidatedBookingReminderDueEvent,
} from "../event-schema.js";
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
  renderBookingReminderEmail,
  renderBookingRescheduledEmail,
} from "./templates.js";

export interface BookingEmailHandlerOptions {
  pool: pg.Pool;
  emailService: TransactionalEmailService;
  encryptionKey?: string | Buffer | undefined;
  guestBookingManagementUrl?: string | undefined;
  appBaseUrl?: string | undefined;
  now?: (() => Date) | undefined;
}

function appUrl(baseUrl: string | undefined, path: string) {
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : null;
}

type ReminderEmailRow = {
  reminder_status: string;
  scheduled_for_start_at: Date;
  booking_status: string;
  start_at: Date;
  duration_minutes: number;
  price_agorot: number | null;
  public_reference: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_management_token_encrypted: string | null;
  organization_name: string;
  organization_slug: string;
  suspended_at: Date | null;
  archived_at: Date | null;
  resource_name: string | null;
  service_name: string;
};

async function markReminderSkipped(
  client: pg.PoolClient,
  reminderId: string,
  reason: string,
  now: Date,
) {
  await client.query(
    `UPDATE booking_reminder
     SET status = 'skipped', skipped_at = $2, skip_reason = $3
     WHERE id = $1 AND status = 'dispatched'`,
    [reminderId, now, reason],
  );
  return { outcome: `skipped_${reason}` };
}

async function processReminderEmail(
  client: pg.PoolClient,
  event: ValidatedBookingReminderDueEvent,
  options: BookingEmailHandlerOptions,
) {
  const result = await client.query<ReminderEmailRow>(
    `SELECT
       reminder.status AS reminder_status,
       reminder.scheduled_for_start_at,
       booking.status AS booking_status,
       booking.start_at,
       booking.duration_minutes,
       booking.price_agorot,
       booking.public_reference,
       booking.guest_name,
       booking.guest_email,
       booking.guest_management_token_encrypted,
       organization.name AS organization_name,
       organization.slug AS organization_slug,
       organization.suspended_at,
       organization.archived_at,
       resource.name AS resource_name,
       service.name AS service_name
     FROM booking_reminder AS reminder
     JOIN booking ON booking.id = reminder.booking_id
     JOIN organization ON organization.id = booking.organization_id
     LEFT JOIN resource ON resource.id = booking.resource_id
       AND resource.organization_id = booking.organization_id
     JOIN service ON service.id = booking.service_id
       AND service.organization_id = booking.organization_id
     WHERE reminder.id = $1 AND reminder.booking_id = $2
     FOR UPDATE OF reminder, booking, organization`,
    [event.payload.reminderId, event.payload.bookingId],
  );
  const row = result.rows[0];
  if (!row) return { outcome: "skipped_missing_reminder" };
  if (row.reminder_status !== "dispatched")
    return { outcome: `skipped_reminder_${row.reminder_status}` };

  const now = options.now?.() ?? new Date();
  if (
    row.scheduled_for_start_at.getTime() !==
    new Date(event.payload.scheduledForStartAt).getTime()
  )
    return markReminderSkipped(
      client,
      event.payload.reminderId,
      "stale_event",
      now,
    );
  if (row.booking_status !== "confirmed")
    return markReminderSkipped(
      client,
      event.payload.reminderId,
      row.booking_status === "cancelled" ? "cancelled" : "not_confirmed",
      now,
    );
  if (row.start_at.getTime() !== row.scheduled_for_start_at.getTime())
    return markReminderSkipped(
      client,
      event.payload.reminderId,
      "rescheduled",
      now,
    );
  if (!row.guest_email)
    return markReminderSkipped(
      client,
      event.payload.reminderId,
      "no_email",
      now,
    );
  if (row.start_at.getTime() <= now.getTime())
    return markReminderSkipped(
      client,
      event.payload.reminderId,
      "start_passed",
      now,
    );
  if (row.archived_at)
    return markReminderSkipped(
      client,
      event.payload.reminderId,
      "archived",
      now,
    );
  if (row.suspended_at)
    return markReminderSkipped(
      client,
      event.payload.reminderId,
      "suspended",
      now,
    );

  let managementUrl: string | null = null;
  if (row.guest_management_token_encrypted) {
    if (!options.encryptionKey)
      throw new PermanentEventError("missing_token_encryption_key_config");
    if (!options.guestBookingManagementUrl)
      throw new PermanentEventError(
        "missing_guest_booking_management_url_config",
      );
    managementUrl = buildGuestManagementUrl(
      options.guestBookingManagementUrl,
      decryptGuestManagementToken(
        row.guest_management_token_encrypted,
        options.encryptionKey,
      ),
    );
  }

  const rendered = renderBookingReminderEmail(
    {
      guestName: row.guest_name,
      guestEmail: row.guest_email,
      publicReference: row.public_reference,
      startAt: row.start_at.toISOString(),
      durationMinutes: row.duration_minutes,
      priceAgorot: row.price_agorot,
    },
    managementUrl,
    {
      organizationName: row.organization_name,
      organizationSlug: row.organization_slug,
      resourceName: row.resource_name ?? "",
      serviceName: row.service_name,
    },
  );
  await options.emailService.send({
    ...rendered,
    idempotencyKey: `booking-reminder/${event.payload.reminderId}`,
  });
  await client.query(
    `UPDATE booking_reminder
     SET status = 'sent', sent_at = $2
     WHERE id = $1 AND status = 'dispatched'`,
    [event.payload.reminderId, now],
  );
  return { outcome: "email_sent" };
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
        if (event.eventType === "booking.reminder_due")
          return processReminderEmail(client, event, options);

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
