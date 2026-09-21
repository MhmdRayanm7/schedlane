import Type from "typebox";
import { uuidSchema } from "../../../http/schemas.js";

export const organizationParams = Type.Object({ organizationId: uuidSchema });
export const resourceParams = Type.Object({
  organizationId: uuidSchema,
  resourceId: uuidSchema,
});
export const linkResourceBody = Type.Object({ membershipId: uuidSchema });
export const createResourceBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120, pattern: ".*\\S.*" }),
});
