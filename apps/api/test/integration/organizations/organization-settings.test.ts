import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import { organizationRoutes } from "../../../src/modules/organizations/http/index.js";
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
      email: "member@example.test",
    };
  },
}));

const app = Fastify();
await app.register(organizationRoutes);
afterAll(() => app.close());

async function getSettings(userId: string, organizationId: string) {
  return app.inject({
    method: "GET",
    url: `/api/organizations/${organizationId}/settings`,
    headers: { "x-test-user": userId },
  });
}

describe("GET /api/organizations/:organizationId/settings", () => {
  it.each(["owner", "manager"] as const)(
    "returns authoritative settings for an %s",
    async (role) => {
      const user = await createTestUser();
      const organization = await createTestOrganization({
        pricingEnabled: true,
      });
      await addTestMembership({
        userId: user.id,
        organizationId: organization.id,
        role,
      });

      const response = await getSettings(user.id, organization.id);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        staffTeamVisibility: "team",
        pricingEnabled: true,
      });
    },
  );

  it("returns the persisted staff visibility and disabled pricing values", async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization({
      pricingEnabled: false,
    });
    await addTestMembership({
      userId: user.id,
      organizationId: organization.id,
      role: "owner",
    });
    await db
      .updateTable("organization")
      .set({ staff_team_visibility: "self" })
      .where("id", "=", organization.id)
      .execute();

    const response = await getSettings(user.id, organization.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      staffTeamVisibility: "self",
      pricingEnabled: false,
    });
  });

  it("rejects staff management access", async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization();
    await addTestMembership({
      userId: user.id,
      organizationId: organization.id,
      role: "staff",
    });

    const response = await getSettings(user.id, organization.id);

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("INSUFFICIENT_ORGANIZATION_ROLE");
  });

  it("does not reveal an organization to a non-member", async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization();

    const response = await getSettings(user.id, organization.id);

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("ORGANIZATION_NOT_FOUND");
  });
});
