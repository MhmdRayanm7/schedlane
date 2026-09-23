import { describe, expect, it } from "vitest";
import {
  decryptGuestManagementToken,
  encryptGuestManagementToken,
  generateGuestManagementToken,
  hashGuestManagementToken,
  isGuestManagementToken,
  parseEncryptionKey,
} from "../../../src/modules/bookings/domain/management-token.js";

describe("guest Booking management tokens", () => {
  it("generates distinct 32-byte base64url credentials", () => {
    const first = generateGuestManagementToken();
    const second = generateGuestManagementToken();
    expect(first).toHaveLength(43);
    expect(isGuestManagementToken(first)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("hashes deterministically to lowercase SHA-256 hex", () => {
    const token = generateGuestManagementToken();
    const hash = hashGuestManagementToken(token);
    expect(hash).toBe(hashGuestManagementToken(token));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashGuestManagementToken(generateGuestManagementToken())).not.toBe(
      hash,
    );
  });

  it("rejects noncanonical token formats without trimming", () => {
    const token = generateGuestManagementToken();
    expect(isGuestManagementToken(` ${token}`)).toBe(false);
    expect(isGuestManagementToken(`${token} `)).toBe(false);
    expect(isGuestManagementToken(token.slice(1))).toBe(false);
    expect(isGuestManagementToken(`${token.slice(0, -1)}+`)).toBe(false);
  });

  describe("authenticated encryption at rest", () => {
    const fixedKey = Buffer.from("01234567890123456789012345678901", "utf8");
    const fixedIv = Buffer.from("123456789012", "utf8");
    const knownToken = "0123456789012345678901234567890123456789012";

    it("encrypts with fixed test vector into a versioned v1 envelope and decrypts", () => {
      const envelope = encryptGuestManagementToken(
        knownToken,
        fixedKey,
        fixedIv,
      );
      expect(envelope.startsWith("v1.")).toBe(true);
      const parts = envelope.split(".");
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe("v1");
      expect(parts[1]).toBe(fixedIv.toString("base64url"));

      const decrypted = decryptGuestManagementToken(envelope, fixedKey);
      expect(decrypted).toBe(knownToken);
    });

    it("accepts base64 encoded string keys", () => {
      const base64Key = fixedKey.toString("base64");
      const envelope = encryptGuestManagementToken(
        knownToken,
        base64Key,
        fixedIv,
      );
      const decrypted = decryptGuestManagementToken(envelope, base64Key);
      expect(decrypted).toBe(knownToken);
    });

    it("uses a cryptographically random IV when not explicitly provided", () => {
      const envelope1 = encryptGuestManagementToken(knownToken, fixedKey);
      const envelope2 = encryptGuestManagementToken(knownToken, fixedKey);
      expect(envelope1).not.toBe(envelope2);
      expect(decryptGuestManagementToken(envelope1, fixedKey)).toBe(knownToken);
      expect(decryptGuestManagementToken(envelope2, fixedKey)).toBe(knownToken);
    });

    it("rejects keys that are not 32 bytes", () => {
      expect(() => parseEncryptionKey(Buffer.from("short"))).toThrow(
        /must be exactly 32 bytes/,
      );
      expect(() =>
        parseEncryptionKey(Buffer.alloc(31).toString("base64")),
      ).toThrow(/must be exactly 32 bytes/);
      expect(() =>
        parseEncryptionKey(Buffer.alloc(33).toString("base64")),
      ).toThrow(/must be exactly 32 bytes/);
    });

    it("fails decryption when ciphertext is tampered", () => {
      const envelope = encryptGuestManagementToken(
        knownToken,
        fixedKey,
        fixedIv,
      );
      const [version, iv, ciphertext, tag] = envelope.split(".");
      expect(version && iv && ciphertext && tag).toBeTruthy();
      const tamperedBuf = Buffer.from(ciphertext ?? "", "base64url");
      const firstByte = tamperedBuf[0] ?? 0;
      tamperedBuf[0] = firstByte ^ 1;
      const tamperedEnvelope = `${version}.${iv}.${tamperedBuf.toString("base64url")}.${tag}`;

      expect(() =>
        decryptGuestManagementToken(tamperedEnvelope, fixedKey),
      ).toThrow();
    });

    it("fails decryption when IV is tampered", () => {
      const envelope = encryptGuestManagementToken(
        knownToken,
        fixedKey,
        fixedIv,
      );
      const [version, iv, ciphertext, tag] = envelope.split(".");
      expect(version && iv && ciphertext && tag).toBeTruthy();
      const tamperedBuf = Buffer.from(iv ?? "", "base64url");
      const firstByte = tamperedBuf[0] ?? 0;
      tamperedBuf[0] = firstByte ^ 1;
      const tamperedEnvelope = `${version}.${tamperedBuf.toString("base64url")}.${ciphertext}.${tag}`;

      expect(() =>
        decryptGuestManagementToken(tamperedEnvelope, fixedKey),
      ).toThrow();
    });

    it("fails decryption when authentication tag is tampered", () => {
      const envelope = encryptGuestManagementToken(
        knownToken,
        fixedKey,
        fixedIv,
      );
      const [version, iv, ciphertext, tag] = envelope.split(".");
      expect(version && iv && ciphertext && tag).toBeTruthy();
      const tamperedBuf = Buffer.from(tag ?? "", "base64url");
      const firstByte = tamperedBuf[0] ?? 0;
      tamperedBuf[0] = firstByte ^ 1;
      const tamperedEnvelope = `${version}.${iv}.${ciphertext}.${tamperedBuf.toString("base64url")}`;

      expect(() =>
        decryptGuestManagementToken(tamperedEnvelope, fixedKey),
      ).toThrow();
    });

    it("fails decryption with wrong key", () => {
      const envelope = encryptGuestManagementToken(
        knownToken,
        fixedKey,
        fixedIv,
      );
      const differentKey = Buffer.from(
        "99999999999999999999999999999999",
        "utf8",
      );
      expect(() =>
        decryptGuestManagementToken(envelope, differentKey),
      ).toThrow();
    });

    it("fails decryption for malformed envelope structure", () => {
      expect(() =>
        decryptGuestManagementToken("invalid-envelope", fixedKey),
      ).toThrow(/Invalid guest management token encryption envelope/);
      expect(() =>
        decryptGuestManagementToken("v2.iv.cipher.tag", fixedKey),
      ).toThrow(/Invalid guest management token encryption envelope/);
      expect(() =>
        decryptGuestManagementToken("v1.iv.cipher", fixedKey),
      ).toThrow(/Invalid guest management token encryption envelope/);
    });
  });
});
