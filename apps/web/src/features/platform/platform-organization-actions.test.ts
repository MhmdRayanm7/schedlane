import { describe, expect, it } from "vitest";
import { platformOrganizationActions } from "./platform-organization-actions";
import type { PlatformOrganization } from "./types";

const organization: PlatformOrganization = {
  id: "organization-id",
  name: "Calm Studio",
  slug: "calm-studio",
  owner: null,
  publishedAt: null,
  publicBookingPaused: false,
  suspendedAt: null,
  archivedAt: null,
  pendingPublicationRequestId: null,
  createdAt: "2026-09-29T09:00:00.000Z",
};

describe("platform organization actions", () => {
  it("offers Suspend for an active organization", () => {
    expect(platformOrganizationActions(organization)).toEqual(["suspend"]);
  });

  it("offers Unsuspend instead of Suspend for a suspended organization", () => {
    expect(
      platformOrganizationActions({
        ...organization,
        suspendedAt: "2026-09-29T10:00:00.000Z",
      }),
    ).toEqual(["unsuspend"]);
  });

  it("includes only applicable publication actions", () => {
    expect(
      platformOrganizationActions({
        ...organization,
        publishedAt: "2026-09-29T08:00:00.000Z",
        pendingPublicationRequestId: "request-id",
      }),
    ).toEqual(["review", "unpublish", "suspend"]);
  });
});
