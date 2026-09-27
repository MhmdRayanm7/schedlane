import { postgresErrorMetadata } from "./postgres-errors.js";

export const MAX_SERIALIZATION_ATTEMPTS = 3;

export async function runWithSerializationRetry<Result>(
  attempt: () => Promise<Result>,
  exhaustedMessage: string,
): Promise<Result> {
  for (
    let serializationAttempt = 1;
    serializationAttempt <= MAX_SERIALIZATION_ATTEMPTS;
    serializationAttempt += 1
  ) {
    try {
      return await attempt();
    } catch (error) {
      const code = postgresErrorMetadata(error).code;
      if (
        (code === "40001" || code === "40P01") &&
        serializationAttempt < MAX_SERIALIZATION_ATTEMPTS
      )
        continue;
      throw error;
    }
  }
  throw new Error(exhaustedMessage);
}
