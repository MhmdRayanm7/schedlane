import type { FastifySchemaCompiler } from "fastify";
import type { TSchema } from "typebox";
import { Check } from "typebox/value";

export const typeboxValidatorCompiler: FastifySchemaCompiler<TSchema> = ({
  schema,
}) => {
  return (value) =>
    Check(schema, value) ? { value } : { error: new Error("Invalid request") };
};
