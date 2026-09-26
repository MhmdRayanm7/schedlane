export type StaffTeamVisibility = "team" | "self";

export type OrganizationSettings = {
  staffTeamVisibility: StaffTeamVisibility;
  pricingEnabled: boolean;
};
