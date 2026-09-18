import type { Generated } from "kysely";

export type MembershipRole = "owner" | "manager" | "staff";

export type OrganizationRequestStatus = "pending" | "approved" | "rejected";

export type StaffTeamVisibility = "team" | "self";

export type BookingStatus = "confirmed" | "cancelled" | "no_show";

export interface PlatformAdminTable {
  user_id: string;
  created_at: Generated<Date>;
  revoked_at: Date | null;
}

export interface OrganizationTable {
  id: Generated<string>;
  slug: string;
  name: string;
  staff_team_visibility: Generated<StaffTeamVisibility>;
  pricing_enabled: Generated<boolean>;
  slot_interval_minutes: Generated<number>;
  min_booking_notice_minutes: Generated<number>;
  max_booking_horizon_days: Generated<number>;
  public_booking_paused: Generated<boolean>;
  published_at: Date | null;
  suspended_at: Date | null;
  archived_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrganizationRequestTable {
  id: Generated<string>;
  requested_by_user_id: string;
  name: string;
  status: Generated<OrganizationRequestStatus>;
  reviewed_by_user_id: string | null;
  organization_id: string | null;
  rejection_reason: string | null;
  created_at: Generated<Date>;
  decided_at: Date | null;
}

export interface MembershipTable {
  id: Generated<string>;
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrganizationInvitationTable {
  id: Generated<string>;
  organization_id: string;
  invited_by_user_id: string;
  email: string;
  role: MembershipRole;
  resource_id: string | null;

  // Raw invitation tokens are never persisted.
  token_hash: string;

  expires_at: Date;
  accepted_by_user_id: string | null;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}

export interface AuthUserTable {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ResourceTable {
  id: Generated<string>;
  organization_id: string;
  user_id: string | null;
  name: string;
  deactivated_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ServiceTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  duration_minutes: number;
  price_agorot: number | null;
  buffer_after_minutes: Generated<number>;
  display_order: number;
  deactivated_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ResourceServiceTable {
  organization_id: string;
  resource_id: string;
  service_id: string;
  created_at: Generated<Date>;
}

export interface OrganizationWeeklyHoursTable {
  organization_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
}

export interface ResourceWeeklyHoursOverrideTable {
  organization_id: string;
  resource_id: string;
  weekday: number;
}

export interface ResourceWeeklyHoursIntervalTable
  extends ResourceWeeklyHoursOverrideTable {
  start_minute: number;
  end_minute: number;
}

export interface OrganizationDateOverrideTable {
  organization_id: string;
  local_date: string;
}

export interface OrganizationDateOverrideIntervalTable
  extends OrganizationDateOverrideTable {
  start_minute: number;
  end_minute: number;
}

export interface ResourceDateOverrideTable {
  organization_id: string;
  resource_id: string;
  local_date: string;
}

export interface ResourceDateOverrideIntervalTable
  extends ResourceDateOverrideTable {
  start_minute: number;
  end_minute: number;
}

export interface ResourceTimeBlockTable {
  id: Generated<string>;
  organization_id: string;
  resource_id: string;
  local_date: string;
  start_minute: number;
  end_minute: number;
  created_at: Generated<Date>;
}

export interface BookingTable {
  id: Generated<string>;
  organization_id: string;
  resource_id: string;
  service_id: string;
  public_reference: string;
  status: Generated<BookingStatus>;
  start_at: Date;
  service_end_at: Date;
  occupied_until_at: Date;
  duration_minutes: number;
  buffer_after_minutes: number;
  price_agorot: number | null;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  customer_note: string | null;
  cancelled_at: Date | null;
  cancelled_by_user_id: string | null;
  cancellation_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  user: AuthUserTable;
  platform_admin: PlatformAdminTable;
  organization: OrganizationTable;
  organization_request: OrganizationRequestTable;
  membership: MembershipTable;
  organization_invitation: OrganizationInvitationTable;
  resource: ResourceTable;
  service: ServiceTable;
  resource_service: ResourceServiceTable;
  organization_weekly_hours: OrganizationWeeklyHoursTable;
  resource_weekly_hours_override: ResourceWeeklyHoursOverrideTable;
  resource_weekly_hours_interval: ResourceWeeklyHoursIntervalTable;
  organization_date_override: OrganizationDateOverrideTable;
  organization_date_override_interval: OrganizationDateOverrideIntervalTable;
  resource_date_override: ResourceDateOverrideTable;
  resource_date_override_interval: ResourceDateOverrideIntervalTable;
  resource_time_block: ResourceTimeBlockTable;
  booking: BookingTable;
}
