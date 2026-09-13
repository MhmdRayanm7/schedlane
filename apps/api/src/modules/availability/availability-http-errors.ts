import type { FastifyReply } from "fastify";
import { sendOrganizationWriteStateError } from "../organizations/organization-http-errors.js";
import type { ReplaceOrganizationWeeklyHoursResult } from "./availability-service.js";

export function sendAvailabilityError(
  reply: FastifyReply,
  requestId: string,
  reason:
    | Extract<ReplaceOrganizationWeeklyHoursResult, { ok: false }>["reason"]
    | "resource_not_found"
    | "invalid_date_override",
) {
  if (
    reason === "organization_archived" ||
    reason === "organization_suspended"
  ) {
    return sendOrganizationWriteStateError(reply, requestId, reason);
  }
  const errors = {
    invalid_date_override: [
      400,
      "INVALID_DATE_OVERRIDE",
      "Date availability override is invalid",
    ],
    resource_not_found: [404, "RESOURCE_NOT_FOUND", "Resource not found"],
    organization_not_found: [
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    ],
    insufficient_role: [
      403,
      "AVAILABILITY_MANAGEMENT_NOT_ALLOWED",
      "Your organization role does not allow Availability management",
    ],
    invalid_weekly_hours: [
      400,
      "INVALID_WEEKLY_HOURS",
      "Weekly hours contain invalid or overlapping intervals",
    ],
  } as const;
  const [status, code, message] = errors[reason];
  return reply.code(status).send({ code, message, requestId });
}
