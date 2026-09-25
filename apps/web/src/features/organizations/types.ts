export type OrganizationRole = "owner" | "manager" | "staff";

export type Organization = {
  archivedAt: string | null;
  id: string;
  name: string;
  publishedAt: string | null;
  role: OrganizationRole;
  slug: string;
  suspendedAt: string | null;
};

export type OrganizationsResponse = {
  items: Organization[];
};
