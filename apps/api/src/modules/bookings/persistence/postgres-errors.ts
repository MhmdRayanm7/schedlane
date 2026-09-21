export type PostgresErrorMetadata = {
  code?: string;
  constraint?: string;
};

export function postgresErrorMetadata(error: unknown): PostgresErrorMetadata {
  return typeof error === "object" && error !== null
    ? (error as PostgresErrorMetadata)
    : {};
}
