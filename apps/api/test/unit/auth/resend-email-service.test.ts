import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResendEmailService } from "../../../src/email/resend-email-service.js";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

describe("API Resend email service", () => {
  beforeEach(() => send.mockReset());

  it("passes HTML and plain text to the provider", async () => {
    send.mockResolvedValue({ error: null });
    const service = new ResendEmailService({
      apiKey: "test",
      from: "sender@example.test",
    });
    await service.send({
      to: "person@example.test",
      subject: "Verify",
      text: "Verify email",
      html: "<p>Verify email</p>",
    });
    expect(send).toHaveBeenCalledWith({
      from: "sender@example.test",
      to: "person@example.test",
      subject: "Verify",
      text: "Verify email",
      html: "<p>Verify email</p>",
    });
  });

  it("does not expose provider error details", async () => {
    send.mockResolvedValue({ error: { message: "private provider details" } });
    const service = new ResendEmailService({
      apiKey: "test",
      from: "sender@example.test",
    });
    await expect(
      service.send({
        to: "person@example.test",
        subject: "Verify",
        text: "Verify email",
      }),
    ).rejects.toThrow("Email delivery request failed");
  });
});
