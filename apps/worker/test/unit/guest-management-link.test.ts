import { describe, expect, it } from "vitest";
import { PermanentEventError } from "../../src/bookings/consumer.js";
import {
  buildGuestManagementUrl,
  decryptGuestManagementToken,
  parseEncryptionKey,
} from "../../src/bookings/email/guest-management-link.js";

describe("guest-management-link", () => {
  const testKeyBase64 = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="; // 32 bytes: "01234567890123456789012345678901"
  const testToken = "0123456789012345678901234567890123456789012"; // 43 chars

  const validEnvelope =
    "v1.MTIzNDU2Nzg5MDEy.EsNME9uHVP4D5L7hWNKvnyR0v1e0pO6wZoCukCc5Cb0wuK8nNUJa4AgE4Q.9bez_B22t0eCpU8sWX40LQ";

  it("parses 32-byte base64 encryption key correctly", () => {
    const parsed = parseEncryptionKey(testKeyBase64);
    expect(parsed.length).toBe(32);
    expect(parsed.toString("utf8")).toBe("01234567890123456789012345678901");
  });

  it("throws for invalid key length", () => {
    expect(() =>
      parseEncryptionKey(Buffer.from("too-short").toString("base64")),
    ).toThrow("must be exactly 32 bytes");
  });

  it("builds guest management url using fragment", () => {
    const url = buildGuestManagementUrl(
      "https://example.com/booking/manage",
      testToken,
    );
    expect(url).toBe(`https://example.com/booking/manage#token=${testToken}`);
  });

  it("handles base url with trailing slash", () => {
    const url = buildGuestManagementUrl(
      "https://example.com/booking/manage/",
      testToken,
    );
    expect(url).toBe(`https://example.com/booking/manage#token=${testToken}`);
  });

  it("fails decryption with PermanentEventError on invalid envelope format", () => {
    expect(() =>
      decryptGuestManagementToken("invalid.format", testKeyBase64),
    ).toThrow(PermanentEventError);
  });

  it("fails decryption with PermanentEventError on tampered ciphertext", () => {
    const parts = validEnvelope.split(".");
    // Tamper ciphertext
    const tampered = `${parts[0]}.${parts[1]}.tamperedciphertext.${parts[3]}`;
    expect(() => decryptGuestManagementToken(tampered, testKeyBase64)).toThrow(
      PermanentEventError,
    );
  });

  it("fails decryption with PermanentEventError on tampered tag", () => {
    const parts = validEnvelope.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.AQEBAQEBAQEBAQEBAQEBAQ`;
    expect(() => decryptGuestManagementToken(tampered, testKeyBase64)).toThrow(
      PermanentEventError,
    );
  });
});
