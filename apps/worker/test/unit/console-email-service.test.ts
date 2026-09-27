import { describe, expect, it, vi } from "vitest";
import { ConsoleTransactionalEmailService } from "../../src/bookings/email/console-email-service.js";

describe("ConsoleTransactionalEmailService", () => {
  it("logs only a safe idempotency key", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const service = new ConsoleTransactionalEmailService();
    const secretUrl = "https://example.com/booking/manage#token=secret123";

    await service.send({
      to: "alice@example.com",
      subject: "Booking confirmed",
      text: `Hi Alice,\nManage booking:\n${secretUrl}`,
      idempotencyKey: "booking-email/e1",
    });

    const loggedMessage = consoleSpy.mock.calls[0]?.[0] as string;
    expect(loggedMessage).toBe(
      "[email] Transactional email prepared idempotencyKey: booking-email/e1",
    );
    consoleSpy.mockRestore();
  });
});
