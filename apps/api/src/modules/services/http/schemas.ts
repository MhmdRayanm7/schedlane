import Type from "typebox";
import { uuidSchema } from "../../../http/schemas.js";

export const organizationParams = Type.Object({
  organizationId: uuidSchema,
});

export const serviceParams = Type.Object({
  organizationId: uuidSchema,
  serviceId: uuidSchema,
});

export const serviceResourceParams = Type.Object({
  organizationId: uuidSchema,
  serviceId: uuidSchema,
  resourceId: uuidSchema,
});

const servicePriceSchema = Type.Unsafe<number | null>({
  type: ["integer", "null"],
  minimum: 0,
});

export const createServiceBody = Type.Object({
  name: Type.String({
    minLength: 1,
    maxLength: 120,
    pattern: ".*\\S.*",
  }),
  durationMinutes: Type.Integer({ minimum: 1 }),
  priceAgorot: servicePriceSchema,
  bufferAfterMinutes: Type.Optional(Type.Integer({ minimum: 0 })),
});

export const updateServiceBody = Type.Object(
  {
    name: Type.Optional(createServiceBody.properties.name),
    durationMinutes: Type.Optional(
      createServiceBody.properties.durationMinutes,
    ),
    priceAgorot: Type.Optional(servicePriceSchema),
    bufferAfterMinutes: createServiceBody.properties.bufferAfterMinutes,
  },
  {
    minProperties: 1,
    additionalProperties: Type.Never(),
  },
);
