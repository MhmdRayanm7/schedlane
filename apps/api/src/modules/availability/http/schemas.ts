import Type from "typebox";
import { uuidSchema } from "../../../http/schemas.js";

export const minuteIntervalSchema = Type.Object(
  {
    startMinute: Type.Integer({ minimum: 0, maximum: 1439 }),
    endMinute: Type.Integer({ minimum: 1, maximum: 1440 }),
  },
  { additionalProperties: Type.Never() },
);
export const availabilityModeSchema = Type.Union([
  Type.Literal("inherit"),
  Type.Literal("closed"),
  Type.Literal("custom"),
]);
export const organizationAvailabilityParamsSchema = Type.Object({
  organizationId: uuidSchema,
});
export const resourceAvailabilityParamsSchema = Type.Object({
  organizationId: uuidSchema,
  resourceId: uuidSchema,
});
export const organizationAvailabilityDateParamsSchema = Type.Object({
  organizationId: uuidSchema,
  date: Type.String(),
});
export const resourceAvailabilityDateParamsSchema = Type.Object({
  organizationId: uuidSchema,
  resourceId: uuidSchema,
  date: Type.String(),
});
export const resourceTimeBlockParamsSchema = Type.Object({
  organizationId: uuidSchema,
  resourceId: uuidSchema,
  timeBlockId: uuidSchema,
});
