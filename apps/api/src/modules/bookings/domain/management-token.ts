import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const GUEST_MANAGEMENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateGuestManagementToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGuestManagementToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isGuestManagementToken(token: string): boolean {
  return GUEST_MANAGEMENT_TOKEN_PATTERN.test(token);
}

export function parseEncryptionKey(key: string | Buffer): Buffer {
  const keyBuffer = typeof key === "string" ? Buffer.from(key, "base64") : key;
  if (keyBuffer.length !== 32) {
    throw new Error(
      "Guest management token encryption key must be exactly 32 bytes",
    );
  }
  return keyBuffer;
}

export function encryptGuestManagementToken(
  token: string,
  key: string | Buffer,
  injectedIv?: Buffer,
): string {
  const keyBuffer = parseEncryptionKey(key);
  const iv = injectedIv ?? randomBytes(12);
  if (iv.length !== 12) {
    throw new Error("Initialization vector must be 12 bytes");
  }
  const cipher = createCipheriv("aes-256-gcm", keyBuffer, iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptGuestManagementToken(
  envelope: string,
  key: string | Buffer,
): string {
  const keyBuffer = parseEncryptionKey(key);
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid guest management token encryption envelope");
  }
  const [, ivPart, ciphertextPart, tagPart] = parts;
  if (!ivPart || !ciphertextPart || !tagPart) {
    throw new Error("Invalid guest management token encryption envelope");
  }
  const iv = Buffer.from(ivPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");

  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error(
      "Invalid guest management token encryption envelope parameters",
    );
  }

  const decipher = createDecipheriv("aes-256-gcm", keyBuffer, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");

  return plaintext;
}
