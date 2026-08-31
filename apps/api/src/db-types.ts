import type { Generated } from "kysely";

export type MembershipRole = "owner" | "manager" | "staff";

export type OrganizationRequestStatus = "pending" | "approved" | "rejected";

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

export interface AuthUserTable {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export type StaffTeamVisibility = "team" | "self";

export interface Database {
  user: AuthUserTable;
  platform_admin: PlatformAdminTable;
  organization: OrganizationTable;
  organization_request: OrganizationRequestTable;
  membership: MembershipTable;
}
