import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { availabilityRoutes } from "../../../src/modules/availability/http/management-routes.js";
import { createResource } from "../../../src/modules/resources/application/create.js";
import { deactivateResource } from "../../../src/modules/resources/application/lifecycle.js";
import { linkResourceToMember } from "../../../src/modules/resources/application/membership.js";
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
await app.register(availabilityRoutes);
afterAll(() => app.close());

async function createTestResource(
  organizationId: string,
  userId: string,
  name: string,
) {
  const result = await createResource({ organizationId, userId, name });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.resource;
}

async function fixture() {
  const owner = await createTestUser({ name: "Owner User" });
  const manager = await createTestUser({ name: "Manager User" });
  const staff1 = await createTestUser({ name: "Staff Alice" });
  const staff2 = await createTestUser({ name: "Staff Bob" });

  const org = await createTestOrganization({ name: "Availability Org" });

  const ownerMembership = await addTestMembership({
    organizationId: org.id,
    userId: owner.id,
    role: "owner",
  });
  await addTestMembership({
    organizationId: org.id,
    userId: manager.id,
    role: "manager",
  });
  const staff1Membership = await addTestMembership({
    organizationId: org.id,
    userId: staff1.id,
    role: "staff",
  });
  await addTestMembership({
    organizationId: org.id,
    userId: staff2.id,
    role: "staff",
  });

  // Resource A: unlinked, active
  const resA = await createTestResource(
    org.id,
    owner.id,
    "Resource A (Unlinked)",
  );

  // Resource B: linked to Staff 1, active
  const resB = await createTestResource(
    org.id,
    owner.id,
    "Resource B (Staff Linked)",
  );
  await linkResourceToMember({
    organizationId: org.id,
    userId: owner.id,
    resourceId: resB.id,
    membershipId: staff1Membership.id,
  });

  // Resource C: linked to Owner, active
  const resC = await createTestResource(
    org.id,
    owner.id,
    "Resource C (Owner Linked)",
  );
  await linkResourceToMember({
    organizationId: org.id,
    userId: owner.id,
    resourceId: resC.id,
    membershipId: ownerMembership.id,
  });

  // Resource D: unlinked, deactivated
  const resD = await createTestResource(
    org.id,
    owner.id,
    "Resource D (Deactivated)",
  );
  await deactivateResource({
    organizationId: org.id,
    userId: owner.id,
    resourceId: resD.id,
  });

  // Foreign Organization
  const foreignOwner = await createTestUser({ name: "Foreign Owner" });
  const foreignOrg = await createTestOrganization({ name: "Foreign Org" });
  await addTestMembership({
    organizationId: foreignOrg.id,
    userId: foreignOwner.id,
    role: "owner",
  });
  const foreignRes = await createTestResource(
    foreignOrg.id,
    foreignOwner.id,
    "Foreign Resource",
  );

  const getResources = (actorId: string, orgId = org.id) =>
    app.inject({
      method: "GET",
      url: `/api/organizations/${orgId}/availability/resources`,
      headers: { "x-test-user": actorId },
    });

  return {
    org,
    foreignOrg,
    owner,
    manager,
    staff1,
    staff2,
    resA,
    resB,
    resC,
    resD,
    foreignRes,
    getResources,
  };
}

describe("GET /api/organizations/:organizationId/availability/resources", () => {
  it("returns all same-tenant resources to Owner with active sorted before inactive", async () => {
    const f = await fixture();
    const res = await f.getResources(f.owner.id);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(4);

    // Active resources first, sorted by name
    expect(body.items[0].name).toBe("Resource A (Unlinked)");
    expect(body.items[0].deactivatedAt).toBeNull();
    expect(body.items[1].name).toBe("Resource B (Staff Linked)");
    expect(body.items[1].deactivatedAt).toBeNull();
    expect(body.items[2].name).toBe("Resource C (Owner Linked)");
    expect(body.items[2].deactivatedAt).toBeNull();

    // Inactive resource last
    expect(body.items[3].name).toBe("Resource D (Deactivated)");
    expect(body.items[3].deactivatedAt).not.toBeNull();

    // Does not include cross-tenant resource
    expect(
      body.items.some((r: { id: string }) => r.id === f.foreignRes.id),
    ).toBe(false);
  });

  it("returns unlinked and Staff-linked resources to Manager, omitting Owner-linked resource", async () => {
    const f = await fixture();
    const res = await f.getResources(f.manager.id);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const names = body.items.map((r: { name: string }) => r.name);

    expect(names).toContain("Resource A (Unlinked)");
    expect(names).toContain("Resource B (Staff Linked)");
    expect(names).toContain("Resource D (Deactivated)");
    // Must NOT contain Owner-linked Resource C
    expect(names).not.toContain("Resource C (Owner Linked)");
  });

  it("returns only own linked resource to Staff member", async () => {
    const f = await fixture();
    // Staff 1 has Resource B linked
    const res1 = await f.getResources(f.staff1.id);
    expect(res1.statusCode).toBe(200);
    expect(res1.json().items).toHaveLength(1);
    expect(res1.json().items[0].name).toBe("Resource B (Staff Linked)");

    // Staff 2 has no linked resource
    const res2 = await f.getResources(f.staff2.id);
    expect(res2.statusCode).toBe(200);
    expect(res2.json().items).toHaveLength(0);
  });

  it("enforces tenant isolation and returns 404 for unknown organization", async () => {
    const f = await fixture();
    const res = await f.getResources(f.owner.id, f.foreignOrg.id);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("ORGANIZATION_NOT_FOUND");
  });
});
