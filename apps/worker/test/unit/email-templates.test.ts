import { describe, expect, it } from "vitest";
import { formatJerusalemDateTime } from "../../src/bookings/email/date-format.js";
import {
  renderBookingCancelledEmail,
  renderBookingCreatedEmail,
  renderBookingRescheduledEmail,
} from "../../src/bookings/email/templates.js";
import type { ValidatedBookingEvent } from "../../src/bookings/event-schema.js";

describe("email-templates", () => {
  it("formats date/time in Asia/Jerusalem timezone correctly", () => {
    // 2026-06-15T10:00:00Z -> In Jerusalem (UTC+3 in June daylight saving) -> 13:00
    const formatted = formatJerusalemDateTime("2026-06-15T10:00:00.000Z");
    expect(formatted).toContain("Jun 15, 2026");
    expect(formatted).toContain("13:00");
  });

  describe("renderBookingCreatedEmail", () => {
    const baseEvent: Extract<
      ValidatedBookingEvent,
      { eventType: "booking.created" }
    > = {
      eventId: "e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1",
      aggregateType: "booking",
      aggregateId: "b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1",
      eventType: "booking.created",
      occurredAt: "2026-06-15T10:00:00.000Z",
      payload: {
        bookingId: "b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1",
        organizationId: "o1o1o1o1-o1o1-o1o1-o1o1-o1o1o1o1o1o1",
        resourceId: "r1r1r1r1-r1r1-r1r1-r1r1-r1r1r1r1r1r1",
        serviceId: "s1s1s1s1-s1s1-s1s1-s1s1-s1s1s1s1s1s1",
        publicReference: "SL-ABCD-1234",
        startAt: "2026-06-15T10:00:00.000Z",
        serviceEndAt: "2026-06-15T11:00:00.000Z",
        durationMinutes: 60,
        guestName: "Alice Smith",
        guestEmail: "alice@example.com",
        guestPhone: "+972500000000",
        priceAgorot: 15000,
      },
    };

    it("renders created email with price and management url", () => {
      const email = renderBookingCreatedEmail(
        baseEvent,
        "https://example.com/booking/manage#token=tok123",
      );

      expect(email.to).toBe("alice@example.com");
      expect(email.subject).toBe("Booking confirmed — SL-ABCD-1234");
      expect(email.text).toContain("Hi Alice Smith,");
      expect(email.text).toContain("Reference: SL-ABCD-1234");
      expect(email.text).toContain("Appointment: ");
      expect(email.text).toContain("(Asia/Jerusalem)");
      expect(email.text).toContain("Price: ₪150.00");
      expect(email.text).toContain(
        "https://example.com/booking/manage#token=tok123",
      );
    });

    it("renders created email without price or management link", () => {
      const email = renderBookingCreatedEmail(
        {
          ...baseEvent,
          payload: {
            ...baseEvent.payload,
            priceAgorot: null,
          },
        },
        null,
      );

      expect(email.to).toBe("alice@example.com");
      expect(email.text).not.toContain("Price:");
      expect(email.text).not.toContain("Manage booking:");
    });
  });

  describe("renderBookingRescheduledEmail", () => {
    const baseEvent: Extract<
      ValidatedBookingEvent,
      { eventType: "booking.rescheduled" }
    > = {
      eventId: "e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2",
      aggregateType: "booking",
      aggregateId: "b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1",
      eventType: "booking.rescheduled",
      occurredAt: "2026-06-16T10:00:00.000Z",
      payload: {
        bookingId: "b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1",
        organizationId: "o1o1o1o1-o1o1-o1o1-o1o1-o1o1o1o1o1o1",
        resourceId: "r1r1r1r1-r1r1-r1r1-r1r1-r1r1r1r1r1r1",
        serviceId: "s1s1s1s1-s1s1-s1s1-s1s1-s1s1s1s1s1s1",
        publicReference: "SL-ABCD-1234",
        previousResourceId: "r1r1r1r1-r1r1-r1r1-r1r1-r1r1r1r1r1r1",
        previousStartAt: "2026-06-15T10:00:00.000Z",
        startAt: "2026-06-17T10:00:00.000Z",
        serviceEndAt: "2026-06-17T11:00:00.000Z",
        durationMinutes: 60,
        guestName: "Alice Smith",
        guestEmail: "alice@example.com",
        guestPhone: "+972500000000",
        priceAgorot: null,
      },
    };

    it("renders rescheduled email with previous and new times", () => {
      const email = renderBookingRescheduledEmail(
        baseEvent,
        "https://example.com/booking/manage#token=tok123",
      );

      expect(email.to).toBe("alice@example.com");
      expect(email.subject).toBe("Booking rescheduled — SL-ABCD-1234");
      expect(email.text).toContain("Previous Appointment:");
      expect(email.text).toContain("New Appointment:");
      expect(email.text).toContain(
        "https://example.com/booking/manage#token=tok123",
      );
    });
  });

  describe("renderBookingCancelledEmail", () => {
    const baseEvent: Extract<
      ValidatedBookingEvent,
      { eventType: "booking.cancelled" }
    > = {
      eventId: "e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3",
      aggregateType: "booking",
      aggregateId: "b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1",
      eventType: "booking.cancelled",
      occurredAt: "2026-06-16T10:00:00.000Z",
      payload: {
        bookingId: "b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1",
        organizationId: "o1o1o1o1-o1o1-o1o1-o1o1-o1o1o1o1o1o1",
        resourceId: "r1r1r1r1-r1r1-r1r1-r1r1-r1r1r1r1r1r1",
        serviceId: "s1s1s1s1-s1s1-s1s1-s1s1-s1s1s1s1s1s1",
        publicReference: "SL-ABCD-1234",
        startAt: "2026-06-15T10:00:00.000Z",
        guestName: "Alice Smith",
        guestEmail: "alice@example.com",
        guestPhone: "+972500000000",
        cancelledAt: "2026-06-16T10:00:00.000Z",
        cancelledBy: "guest",
        cancellationReason: "Change of plans",
      },
    };

    it("renders cancelled email with reason and management link", () => {
      const email = renderBookingCancelledEmail(
        baseEvent,
        "https://example.com/booking/manage#token=tok123",
      );

      expect(email.to).toBe("alice@example.com");
      expect(email.subject).toBe("Booking cancelled — SL-ABCD-1234");
      expect(email.text).toContain("Cancellation reason: Change of plans");
      expect(email.text).toContain(
        "https://example.com/booking/manage#token=tok123",
      );
    });

    it("renders cancelled email when reason is null", () => {
      const email = renderBookingCancelledEmail(
        {
          ...baseEvent,
          payload: {
            ...baseEvent.payload,
            cancellationReason: null,
          },
        },
        null,
      );

      expect(email.text).not.toContain("Cancellation reason:");
    });
  });
});
