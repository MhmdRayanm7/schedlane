import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createOrganizationInvitation } from "../../../src/modules/organizations/application/create-invitation.js";
import { createResource } from "../../../src/modules/resources/application/create.js";
import { deactivateResource } from "../../../src/modules/resources/application/lifecycle.js";
import { linkResourceToMember } from "../../../src/modules/resources/application/membership.js";
import { resourceRoutes } from "../../../src/modules/resources/http/index.js";
import {
  addTestMembership,
  createTestOrganization,
  createTestUser,
} from "../../helpers/factories.js";

vi.mock("../../../src/http/auth-guard.js", () => ({
  requireVerifiedUser: async (request: {
    headers: Record<string, string>;
    verifiedUser: unknown;
  }) => {
    request.verifiedUser = {
      id: request.headers["x-test-user"],
      email: "actor@example.test",
    };
  },
}));

const app = Fastify();
await app.register(resourceRoutes);
afterAll(() => app.close());

async function fixture() {
  const owner = await createTestUser({ name: "Owner User" });
  const manager = await createTestUser({ name: "Manager User" });
  const staff1 = await createTestUser({ name: "Staff Alice" });
  const staff2 = await createTestUser({ name: "Staff Bob" });

  const organization = await createTestOrganization({
    name: "Resource Test Org",
  });

  const ownerMembership = await addTestMembership({
    organizationId: organization.id,
    userId: owner.id,
    role: "owner",
  });
  const managerMembership = await addTestMembership({
    organizationId: organization.id,
    userId: manager.id,
    role: "manager",
  });
  const staff1Membership = await addTestMembership({
    organizationId: organization.id,
    userId: staff1.id,
    role: "staff",
  });
  const staff2Membership = await addTestMembership({
    organizationId: organization.id,
    userId: staff2.id,
    role: "staff",
  });

  const resourceCreated = await createResource({
    organizationId: organization.id,
    userId: owner.id,
    name: "Station A",
  });
  if (!resourceCreated.ok) throw new Error(resourceCreated.reason);
  const resource = resourceCreated.resource;

  const getCandidates = (
    actorId: string,
    resourceId = resource.id,
    orgId = organization.id,
  ) =>
    app.inject({
      method: "GET",
      url: `/api/organizations/${orgId}/resources/${resourceId}/link-candidates`,
      headers: { "x-test-user": actorId },
    });

  return {
    organization,
    resource,
    owner,
    manager,
    staff1,
    staff2,
    ownerMembership,
    managerMembership,
    staff1Membership,
    staff2Membership,
    getCandidates,
  };
}

describe("Resource link candidates HTTP", () => {
  it("allows Owner to see all eligible candidate members", async () => {
    const f = await fixture();
    const res = await f.getCandidates(f.owner.id);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currentLink).toBeNull();
    expect(body.pendingInvitation).toBeNull();
    // Owner sees owner, manager, staff1, staff2
    expect(body.candidates).toHaveLength(4);
    expect(body.candidates.map((c: { name: string }) => c.name)).toEqual([
      "Manager User",
      "Owner User",
      "Staff Alice",
      "Staff Bob",
    ]);
  });

  it("limits Manager to only see Staff candidate members", async () => {
    const f = await fixture();
    const res = await f.getCandidates(f.manager.id);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currentLink).toBeNull();
    expect(body.candidates.map((c: { role: string }) => c.role)).toEqual([
      "staff",
      "staff",
    ]);
    expect(body.candidates.map((c: { name: string }) => c.name)).toEqual([
      "Staff Alice",
      "Staff Bob",
    ]);
  });

  it("rejects Staff with 403 RESOURCE_MANAGEMENT_NOT_ALLOWED", async () => {
    const f = await fixture();
    const res = await f.getCandidates(f.staff1.id);

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("RESOURCE_MANAGEMENT_NOT_ALLOWED");
  });

  it("returns 409 RESOURCE_DEACTIVATED when Resource is deactivated", async () => {
    const f = await fixture();
    await deactivateResource({
      organizationId: f.organization.id,
      userId: f.owner.id,
      resourceId: f.resource.id,
    });

    const res = await f.getCandidates(f.owner.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("RESOURCE_DEACTIVATED");
  });

  it("surfaces currentLink when Resource is linked to a Member", async () => {
    const f = await fixture();
    await linkResourceToMember({
      organizationId: f.organization.id,
      userId: f.owner.id,
      resourceId: f.resource.id,
      membershipId: f.staff1Membership.id,
    });

    const res = await f.getCandidates(f.owner.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currentLink).toEqual({
      membershipId: f.staff1Membership.id,
      userId: f.staff1.id,
      name: "Staff Alice",
      email: f.staff1.email,
      role: "staff",
      canManage: true,
    });
    // Staff Alice is the current link, so she is not listed in available candidates
    expect(
      body.candidates.some((c: { userId: string }) => c.userId === f.staff1.id),
    ).toBe(false);
  });

  it("excludes members already linked to another Resource from candidates", async () => {
    const f = await fixture();
    // Create a second resource and link staff2 to it
    const res2 = await createResource({
      organizationId: f.organization.id,
      userId: f.owner.id,
      name: "Station B",
    });
    if (!res2.ok) throw new Error(res2.reason);
    await linkResourceToMember({
      organizationId: f.organization.id,
      userId: f.owner.id,
      resourceId: res2.resource.id,
      membershipId: f.staff2Membership.id,
    });

    const res = await f.getCandidates(f.owner.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Staff2 is linked to Station B, so cannot be linked to Station A
    expect(
      body.candidates.some((c: { userId: string }) => c.userId === f.staff2.id),
    ).toBe(false);
  });

  it("surfaces active pending invitation for the Resource", async () => {
    const f = await fixture();
    const inv = await createOrganizationInvitation({
      organizationId: f.organization.id,
      invitedByUserId: f.owner.id,
      email: "invitee@example.test",
      role: "staff",
      resourceId: f.resource.id,
    });
    expect(inv.ok).toBe(true);

    const res = await f.getCandidates(f.owner.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pendingInvitation).not.toBeNull();
    expect(body.pendingInvitation.email).toBe("invitee@example.test");
  });

  it("returns 404 for missing resource or organization", async () => {
    const f = await fixture();
    const resMissingRes = await f.getCandidates(f.owner.id, randomUUID());
    expect(resMissingRes.statusCode).toBe(404);
    expect(resMissingRes.json().code).toBe("RESOURCE_NOT_FOUND");

    const resMissingOrg = await f.getCandidates(
      f.owner.id,
      f.resource.id,
      randomUUID(),
    );
    expect(resMissingOrg.statusCode).toBe(404);
    expect(resMissingOrg.json().code).toBe("ORGANIZATION_NOT_FOUND");
  });
});
