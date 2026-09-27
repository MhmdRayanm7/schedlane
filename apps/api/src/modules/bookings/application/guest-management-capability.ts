import { config } from "../../../config.js";
import {
  encryptGuestManagementToken,
  generateGuestManagementToken,
  hashGuestManagementToken,
} from "../domain/management-token.js";
import { postgresErrorMetadata } from "../persistence/postgres-errors.js";

const MAX_GUEST_MANAGEMENT_TOKEN_ATTEMPTS = 5;
const GUEST_MANAGEMENT_TOKEN_CONSTRAINT =
  "booking_guest_management_token_hash_key";

export type GuestManagementCapability = {
  rawToken: string;
  tokenHash: string;
  encryptedToken: string;
};

type CapabilityDependencies = {
  generateManagementToken?: () => string;
  encryptionKey?: string | Buffer;
};

export async function runWithGuestManagementCapability<Result>(
  execute: (capability: GuestManagementCapability) => Promise<Result>,
  dependencies: CapabilityDependencies = {},
): Promise<{ result: Result; managementToken: string }> {
  const generateManagementToken =
    dependencies.generateManagementToken ?? generateGuestManagementToken;
  const encryptionKey =
    dependencies.encryptionKey ?? config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY;

  for (
    let tokenAttempt = 1;
    tokenAttempt <= MAX_GUEST_MANAGEMENT_TOKEN_ATTEMPTS;
    tokenAttempt += 1
  ) {
    const rawToken = generateManagementToken();
    const capability = {
      rawToken,
      tokenHash: hashGuestManagementToken(rawToken),
      encryptedToken: encryptGuestManagementToken(rawToken, encryptionKey),
    };
    try {
      return { result: await execute(capability), managementToken: rawToken };
    } catch (error) {
      const { code, constraint } = postgresErrorMetadata(error);
      if (
        code === "23505" &&
        constraint === GUEST_MANAGEMENT_TOKEN_CONSTRAINT &&
        tokenAttempt < MAX_GUEST_MANAGEMENT_TOKEN_ATTEMPTS
      )
        continue;
      if (code === "23505" && constraint === GUEST_MANAGEMENT_TOKEN_CONSTRAINT)
        throw new Error("Could not allocate a unique guest management token");
      throw error;
    }
  }
  throw new Error("Could not allocate a unique guest management token");
}

export const guestManagementCapabilityTestInternals = {
  maxGuestManagementTokenAttempts: MAX_GUEST_MANAGEMENT_TOKEN_ATTEMPTS,
};
