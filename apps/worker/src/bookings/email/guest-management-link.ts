import { createDecipheriv } from "node:crypto";
import { PermanentEventError } from "../consumer.js";

const GUEST_MANAGEMENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function parseEncryptionKey(key: string | Buffer): Buffer {
  const keyBuffer = typeof key === "string" ? Buffer.from(key, "base64") : key;
  if (keyBuffer.length !== 32) {
    throw new Error(
      "Guest management token encryption key must be exactly 32 bytes",
    );
  }
  return keyBuffer;
}

export function decryptGuestManagementToken(
  envelope: string,
  key: string | Buffer,
): string {
  try {
    const keyBuffer = parseEncryptionKey(key);
    const parts = envelope.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new PermanentEventError("management_token_decryption_failed");
    }
    const [, ivPart, ciphertextPart, tagPart] = parts;
    if (!ivPart || !ciphertextPart || !tagPart) {
      throw new PermanentEventError("management_token_decryption_failed");
    }
    const iv = Buffer.from(ivPart, "base64url");
    const ciphertext = Buffer.from(ciphertextPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");

    if (iv.length !== 12 || tag.length !== 16) {
      throw new PermanentEventError("management_token_decryption_failed");
    }

    const decipher = createDecipheriv("aes-256-gcm", keyBuffer, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");

    if (!GUEST_MANAGEMENT_TOKEN_PATTERN.test(plaintext)) {
      throw new PermanentEventError("management_token_decryption_failed");
    }

    return plaintext;
  } catch (error) {
    if (error instanceof PermanentEventError) {
      throw error;
    }
    throw new PermanentEventError("management_token_decryption_failed");
  }
}

export function buildGuestManagementUrl(
  baseUrl: string,
  rawToken: string,
): string {
  const sanitizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${sanitizedBase}#token=${encodeURIComponent(rawToken)}`;
}
