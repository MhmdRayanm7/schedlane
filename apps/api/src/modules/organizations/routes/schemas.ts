import Type from "typebox";
import { uuidSchema } from "../../../http/schemas.js";

export const organizationParamsSchema = Type.Object({
  organizationId: uuidSchema,
});

export const organizationInvitationParamsSchema = Type.Object({
  organizationId: uuidSchema,
  invitationId: uuidSchema,
});

export const organizationMembershipParamsSchema = Type.Object({
  organizationId: uuidSchema,
  membershipId: uuidSchema,
});

export const organizationRequestParamsSchema = Type.Object({
  requestId: Type.String({
    minLength: 1,
  }),
});
