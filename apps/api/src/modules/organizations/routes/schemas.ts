import Type from "typebox";

export const uuidSchema = Type.String({
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});

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
