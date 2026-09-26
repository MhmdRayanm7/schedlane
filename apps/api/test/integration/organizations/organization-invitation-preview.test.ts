import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { sql } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import { acceptOrganizationInvitation } from "../../../src/modules/organizations/application/accept-invitation.js";
import { createOrganizationInvitation } from "../../../src/modules/organizations/application/create-invitation.js";
import { revokeOrganizationInvitation } from "../../../src/modules/organizations/application/revoke-invitation.js";
import { organizationRoutes } from "../../../src/modules/organizations/http/index.js";
import { createResource } from "../../../src/modules/resources/application/create.js";

vi.mock("../../../src/email/index.js", () => ({
  emailService: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../src/http/auth-guard.js", () => ({
  requireVerifiedUser: async (request: {
    headers: Record<string, string>;
    verifiedUser: unknown;
  }) => {
    request.verifiedUser = {
      id: request.headers["x-test-user-id"],
      email: request.headers["x-test-user-email"],
    };
  },
}));

const app = Fastify();
await app.register(organizationRoutes);
afterAll(() => app.close());

async function createTestUser(name: string, email?: string) {
  const id = randomUUID();
  return db
    .insertInto("user")
    .values({
      id,
      name,
      email: email ?? `${id}@example.test`,
      emailVerified: true,
      image: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function createTestOrganization() {
  const owner = await createTestUser("Owner");
  const organization = await db
    .insertInto("organization")
    .values({
      slug: `preview-org-${randomUUID()}`,
      name: "Schedlane Preview Org",
      published_at: null,
      archived_at: null,
      suspended_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await db
    .insertInto("membership")
    .values({
      organization_id: organization.id,
      user_id: owner.id,
      role: "owner",
    })
    .execute();

  return { owner, organization };
}

describe("POST /api/organization-invitations/preview", () => {
  it("returns preview data for a valid manager invitation", async () => {
    const { owner, organization } = await createTestOrganization();
    const inviteeEmail = "invitee@example.test";
    const invitee = await createTestUser("Invitee", inviteeEmail);

    const created = await createOrganizationInvitation({
      invitedByUserId: owner.id,
      organizationId: organization.id,
      email: inviteeEmail,
      role: "manager",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await app.inject({
      method: "POST",
      url: "/api/organization-invitations/preview",
      headers: {
        "x-test-user-id": invitee.id,
        "x-test-user-email": invitee.email,
      },
      payload: { token: created.token },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      organizationId: organization.id,
      organizationName: "Schedlane Preview Org",
      role: "manager",
      resource: null,
      invitedByName: "Owner",
    });
    expect(body.expiresAt).toBeDefined();

    // Verify preview did not mutate state
    const inDb = await db
      .selectFrom("organization_invitation")
      .select(["accepted_at", "revoked_at"])
      .where("id", "=", created.invitation.id)
      .executeTakeFirstOrThrow();
    expect(inDb.accepted_at).toBeNull();
    expect(inDb.revoked_at).toBeNull();
  });

  it("returns preview data with resource for a staff invitation", async () => {
    const { owner, organization } = await createTestOrganization();
    const resource = await createResource({
      userId: owner.id,
      organizationId: organization.id,
      name: "Chair 1",
    });
    expect(resource.ok).toBe(true);
    if (!resource.ok) return;

    const inviteeEmail = "staff-invitee@example.test";
    const invitee = await createTestUser("Staff Invitee", inviteeEmail);

    const created = await createOrganizationInvitation({
      invitedByUserId: owner.id,
      organizationId: organization.id,
      email: inviteeEmail,
      role: "staff",
      resourceId: resource.resource.id,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await app.inject({
      method: "POST",
      url: "/api/organization-invitations/preview",
      headers: {
        "x-test-user-id": invitee.id,
        "x-test-user-email": invitee.email,
      },
      payload: { token: created.token },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.role).toBe("staff");
    expect(body.resource).toEqual({
      id: resource.resource.id,
      name: "Chair 1",
    });
  });

  it("returns 403 when authenticated user email does not match invitation email", async () => {
    const { owner, organization } = await createTestOrganization();
    const wrongUser = await createTestUser("Wrong User", "wrong@example.test");
    const resource = await createResource({
      userId: owner.id,
      organizationId: organization.id,
      name: "Chair",
    });
    expect(resource.ok).toBe(true);
    if (!resource.ok) return;

    const created = await createOrganizationInvitation({
      invitedByUserId: owner.id,
      organizationId: organization.id,
      email: "intended@example.test",
      role: "staff",
      resourceId: resource.resource.id,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await app.inject({
      method: "POST",
      url: "/api/organization-invitations/preview",
      headers: {
        "x-test-user-id": wrongUser.id,
        "x-test-user-email": wrongUser.email,
      },
      payload: { token: created.token },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("ORGANIZATION_INVITATION_EMAIL_MISMATCH");
  });

  it("returns 404 for an invalid token", async () => {
    const user = await createTestUser("Someone");

    const response = await app.inject({
      method: "POST",
      url: "/api/organization-invitations/preview",
      headers: {
        "x-test-user-id": user.id,
        "x-test-user-email": user.email,
      },
      payload: { token: "non-existent-token" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("ORGANIZATION_INVITATION_NOT_FOUND");
  });

  it("returns 409 when the invitation has expired", async () => {
    const { owner, organization } = await createTestOrganization();
    const inviteeEmail = "expired-invitee@example.test";
    const invitee = await createTestUser("Invitee", inviteeEmail);

    const created = await createOrganizationInvitation({
      invitedByUserId: owner.id,
      organizationId: organization.id,
      email: inviteeEmail,
      role: "manager",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Fast-forward expiration in db while respecting expiry check constraint (expires_at > created_at)
    await sql`UPDATE organization_invitation
      SET created_at = NOW() - interval '8 days', expires_at = NOW() - interval '1 day'
      WHERE id = ${created.invitation.id}::uuid`.execute(db);

    const response = await app.inject({
      method: "POST",
      url: "/api/organization-invitations/preview",
      headers: {
        "x-test-user-id": invitee.id,
        "x-test-user-email": invitee.email,
      },
      payload: { token: created.token },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_INVITATION_EXPIRED");
  });

  it("returns 409 when the invitation was revoked", async () => {
    const { owner, organization } = await createTestOrganization();
    const inviteeEmail = "revoked-invitee@example.test";
    const invitee = await createTestUser("Invitee", inviteeEmail);

    const created = await createOrganizationInvitation({
      invitedByUserId: owner.id,
      organizationId: organization.id,
      email: inviteeEmail,
      role: "manager",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await revokeOrganizationInvitation({
      userId: owner.id,
      organizationId: organization.id,
      invitationId: created.invitation.id,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/organization-invitations/preview",
      headers: {
        "x-test-user-id": invitee.id,
        "x-test-user-email": invitee.email,
      },
      payload: { token: created.token },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_INVITATION_REVOKED");
  });

  it("returns 409 when the invitation was already accepted", async () => {
    const { owner, organization } = await createTestOrganization();
    const inviteeEmail = "accepted-invitee@example.test";
    const invitee = await createTestUser("Invitee", inviteeEmail);

    const created = await createOrganizationInvitation({
      invitedByUserId: owner.id,
      organizationId: organization.id,
      email: inviteeEmail,
      role: "manager",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await acceptOrganizationInvitation({
      userId: invitee.id,
      userEmail: invitee.email,
      token: created.token,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/organization-invitations/preview",
      headers: {
        "x-test-user-id": invitee.id,
        "x-test-user-email": invitee.email,
      },
      payload: { token: created.token },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe(
      "ORGANIZATION_INVITATION_ALREADY_ACCEPTED",
    );
  });

  it("returns 409 when the user is already a member", async () => {
    const { owner, organization } = await createTestOrganization();
    const member = await createTestUser("Existing Member");

    await db
      .insertInto("membership")
      .values({
        organization_id: organization.id,
        user_id: member.id,
        role: "staff",
      })
      .execute();

    // Create an unaccepted invitation directly in DB for member's email
    const { createHash, randomBytes } = await import("node:crypto");
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await db
      .insertInto("organization_invitation")
      .values({
        organization_id: organization.id,
        invited_by_user_id: owner.id,
        email: member.email,
        role: "manager",
        resource_id: null,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
        accepted_at: null,
        accepted_by_user_id: null,
        revoked_at: null,
      })
      .execute();

    const response = await app.inject({
      method: "POST",
      url: "/api/organization-invitations/preview",
      headers: {
        "x-test-user-id": member.id,
        "x-test-user-email": member.email,
      },
      payload: { token: rawToken },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_MEMBER_ALREADY_EXISTS");
  });
});
