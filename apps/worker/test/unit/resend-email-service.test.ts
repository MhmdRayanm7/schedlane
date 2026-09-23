import { describe, expect, it, vi } from "vitest";
import { ResendTransactionalEmailService } from "../../src/bookings/email/resend-email-service.js";

vi.mock("resend", () => {
  class Resend {
    emails = {
      send: vi.fn().mockImplementation(async (payload, _options) => {
        if (payload.to === "fail@example.com") {
          return { error: { message: "Invalid recipient" }, data: null };
        }
        return {
          data: { id: "resend-msg-123" },
          error: null,
        };
      }),
    };
  }
  return { Resend };
});

describe("ResendTransactionalEmailService", () => {
  it("sends email with Idempotency-Key header", async () => {
    const service = new ResendTransactionalEmailService({
      apiKey: "re_test_key",
      from: "Schedlane <noreply@schedlane.com>",
    });

    const result = await service.send({
      to: "guest@example.com",
      subject: "Booking confirmed",
      text: "Hello",
      idempotencyKey: "booking-email/evt-123",
    });

    expect(result.id).toBe("resend-msg-123");
  });

  it("throws when resend returns error", async () => {
    const service = new ResendTransactionalEmailService({
      apiKey: "re_test_key",
      from: "Schedlane <noreply@schedlane.com>",
    });

    await expect(
      service.send({
        to: "fail@example.com",
        subject: "Fail",
        text: "Fail",
        idempotencyKey: "booking-email/evt-fail",
      }),
    ).rejects.toThrow("Resend failed to send email: Invalid recipient");
  });
});
