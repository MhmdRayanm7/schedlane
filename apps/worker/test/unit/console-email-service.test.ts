import { describe, expect, it, vi } from "vitest";
import { ConsoleTransactionalEmailService } from "../../src/bookings/email/console-email-service.js";

describe("ConsoleTransactionalEmailService", () => {
  it("logs safe metadata and does not log email body or token", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const service = new ConsoleTransactionalEmailService();

    const secretUrl = "https://example.com/booking/manage#token=secret123";
    const bodyWithSecret = `Hi Alice,\nManage booking:\n${secretUrl}`;

    await service.send({
      to: "alice@example.com",
      subject: "Booking confirmed — SL-123",
      text: bodyWithSecret,
      idempotencyKey: "booking-email/e1",
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = consoleSpy.mock.calls[0]?.[0] as string;

    expect(loggedMessage).toContain("alice@example.com");
    expect(loggedMessage).toContain("Booking confirmed — SL-123");
    expect(loggedMessage).toContain("booking-email/e1");
    expect(loggedMessage).not.toContain("secret123");
    expect(loggedMessage).not.toContain(secretUrl);
    expect(loggedMessage).not.toContain("Hi Alice");

    consoleSpy.mockRestore();
  });
});
