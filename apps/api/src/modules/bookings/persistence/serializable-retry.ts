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
      if (
        postgresErrorMetadata(error).code === "40001" &&
        serializationAttempt < MAX_SERIALIZATION_ATTEMPTS
      )
        continue;
      throw error;
    }
  }
  throw new Error(exhaustedMessage);
}
