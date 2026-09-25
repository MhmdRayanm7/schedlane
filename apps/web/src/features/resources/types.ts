export type Resource = {
  id: string;
  name: string;
  isLinked: boolean;
  deactivatedAt: string | null;
  createdAt: string;
};

export type ResourcesResponse = {
  items: Resource[];
};

export type CreateResourceInput = {
  name: string;
};

export type ResourceLinkCandidates = {
  currentLink: {
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: "owner" | "manager" | "staff";
    canManage: boolean;
  } | null;
  pendingInvitation: {
    id: string;
    email: string;
    expiresAt: string;
  } | null;
  candidates: Array<{
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: "owner" | "manager" | "staff";
  }>;
};
