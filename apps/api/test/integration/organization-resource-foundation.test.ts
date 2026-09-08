import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import type { MembershipRole } from "../../src/db-types.js";
import {
  acceptOrganizationInvitation,
  createOrganizationInvitation,
} from "../../src/modules/organizations/organization-invitation-service.js";
import { archiveOrganization } from "../../src/modules/organizations/organization-lifecycle-service.js";
import {
  leaveOrganization,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from "../../src/modules/organizations/organization-membership-service.js";
import { suspendOrganization } from "../../src/modules/organizations/organization-suspension-service.js";
import {
  createResource,
  linkResourceToMember,
} from "../../src/modules/resources/resource-service.js";

async function createTestUser(name: string) {
  const id = randomUUID();
  return db
    .insertInto("user")
    .values({
      id,
      name,
      email: `${id}@example.test`,
      emailVerified: true,
      image: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function createMembership(
  organizationId: string,
  userId: string,
  role: MembershipRole,
) {
  return db
    .insertInto("membership")
    .values({ organization_id: organizationId, user_id: userId, role })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function createTestOrganization() {
  const owner = await createTestUser("Owner");
  const organization = await db
    .insertInto("organization")
    .values({
      slug: `foundation-${randomUUID()}`,
      name: "Foundation organization",
      published_at: null,
      archived_at: null,
      suspended_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const ownerMembership = await createMembership(
    organization.id,
    owner.id,
    "owner",
  );
  return { organization, owner, ownerMembership };
}

async function createTestResource(
  organizationId: string,
  ownerId: string,
  name = "Staff resource",
) {
  const result = await createResource({
    organizationId,
    userId: ownerId,
    name,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.resource;
}

describe("organization / membership / invitation / resource foundation", () => {
  it("rejects the sole Owner leaving and preserves their membership", async () => {
    const { organization, owner, ownerMembership } =
      await createTestOrganization();

    expect(
      await leaveOrganization({
        organizationId: organization.id,
        userId: owner.id,
      }),
    ).toEqual({ ok: false, reason: "last_owner" });
    expect(await db.selectFrom("membership").selectAll().execute()).toEqual([
      ownerMembership,
    ]);
  });

  it("rejects demoting the sole Owner and preserves their role", async () => {
    const { organization, owner, ownerMembership } =
      await createTestOrganization();

    expect(
      await updateOrganizationMemberRole({
        organizationId: organization.id,
        userId: owner.id,
        membershipId: ownerMembership.id,
        role: "staff",
      }),
    ).toEqual({ ok: false, reason: "last_owner" });
    expect(await db.selectFrom("membership").selectAll().execute()).toEqual([
      ownerMembership,
    ]);
  });

  it("retains one Owner when both Owners attempt to leave concurrently", async () => {
    const { organization, owner } = await createTestOrganization();
    const otherOwner = await createTestUser("Other Owner");
    await createMembership(organization.id, otherOwner.id, "owner");

    const results = await Promise.all(
      [owner, otherOwner].map((user) =>
        leaveOrganization({ organizationId: organization.id, userId: user.id }),
      ),
    );

    expect(results).toEqual(
      expect.arrayContaining([
        { ok: true },
        { ok: false, reason: "last_owner" },
      ]),
    );
    const remaining = await db
      .selectFrom("membership")
      .select(["user_id", "role"])
      .where("organization_id", "=", organization.id)
      .execute();
    expect(remaining).toHaveLength(1);
    const rejectedUser = [owner, otherOwner].find(
      (_user, index) => results[index]?.ok === false,
    );
    expect(remaining[0]).toEqual({
      user_id: rejectedUser?.id,
      role: "owner",
    });
  });

  it.each(["archived", "suspended"] as const)(
    "rejects Resource creation in an %s organization without persisting a Resource",
    async (state) => {
      const { organization, owner } = await createTestOrganization();
      const input = { organizationId: organization.id, userId: owner.id };

      if (state === "archived") {
        expect((await archiveOrganization(input)).ok).toBe(true);
      } else {
        const admin = await createTestUser("Platform admin");
        await db
          .insertInto("platform_admin")
          .values({ user_id: admin.id, revoked_at: null })
          .execute();
        expect(
          (
            await suspendOrganization({
              organizationId: organization.id,
              userId: admin.id,
            })
          ).ok,
        ).toBe(true);
      }

      expect(
        await createResource({ ...input, name: "Blocked resource" }),
      ).toEqual({
        ok: false,
        reason: `organization_${state}`,
      });
      expect(await db.selectFrom("resource").selectAll().execute()).toEqual([]);
    },
  );

  it("accepts a Staff invitation with its membership, Resource link, and acceptance state", async () => {
    const { organization, owner } = await createTestOrganization();
    const resource = await createTestResource(organization.id, owner.id);
    const staff = await createTestUser("Invited Staff");
    const invitation = await createOrganizationInvitation({
      organizationId: organization.id,
      invitedByUserId: owner.id,
      email: staff.email,
      role: "staff",
      resourceId: resource.id,
    });
    expect(invitation.ok).toBe(true);
    if (!invitation.ok) throw new Error(invitation.reason);

    const accepted = await acceptOrganizationInvitation({
      userId: staff.id,
      userEmail: staff.email,
      token: invitation.token,
    });

    expect(accepted).toEqual({
      ok: true,
      organizationId: organization.id,
      role: "staff",
      resourceId: resource.id,
      acceptedAt: expect.any(String),
    });
    expect(
      await db
        .selectFrom("membership")
        .select(["organization_id", "user_id", "role"])
        .where("user_id", "=", staff.id)
        .execute(),
    ).toEqual([
      { organization_id: organization.id, user_id: staff.id, role: "staff" },
    ]);
    expect(
      await db
        .selectFrom("resource")
        .select(["id", "name", "user_id"])
        .where("id", "=", resource.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ id: resource.id, name: resource.name, user_id: staff.id });
    const storedInvitation = await db
      .selectFrom("organization_invitation")
      .select(["accepted_at", "accepted_by_user_id", "revoked_at"])
      .where("id", "=", invitation.invitation.id)
      .executeTakeFirstOrThrow();
    expect(storedInvitation).toEqual({
      accepted_at: expect.any(Date),
      accepted_by_user_id: staff.id,
      revoked_at: null,
    });
    if (!accepted.ok) throw new Error(accepted.reason);
    expect(storedInvitation.accepted_at?.toISOString()).toBe(
      accepted.acceptedAt,
    );
  });

  it.each(["removal", "self-leave"] as const)(
    "unlinks a Member's Resource on %s while preserving its id and name",
    async (flow) => {
      const { organization, owner, ownerMembership } =
        await createTestOrganization();
      const staff = await createTestUser("Linked Staff");
      const membership = await createMembership(
        organization.id,
        staff.id,
        "staff",
      );
      const resource = await createTestResource(organization.id, owner.id);
      expect(
        await linkResourceToMember({
          organizationId: organization.id,
          userId: owner.id,
          resourceId: resource.id,
          membershipId: membership.id,
        }),
      ).toEqual({
        ok: true,
        resource: { id: resource.id, linkedMembershipId: membership.id },
      });
      expect(
        await db
          .selectFrom("resource")
          .select("user_id")
          .where("id", "=", resource.id)
          .executeTakeFirstOrThrow(),
      ).toEqual({ user_id: staff.id });

      const result =
        flow === "removal"
          ? await removeOrganizationMember({
              organizationId: organization.id,
              userId: owner.id,
              membershipId: membership.id,
            })
          : await leaveOrganization({
              organizationId: organization.id,
              userId: staff.id,
            });

      expect(result).toEqual({ ok: true });
      expect(await db.selectFrom("membership").selectAll().execute()).toEqual([
        ownerMembership,
      ]);
      expect(
        await db
          .selectFrom("resource")
          .select(["id", "name", "user_id"])
          .execute(),
      ).toEqual([{ id: resource.id, name: resource.name, user_id: null }]);
    },
  );

  it("rejects linking a Member to a second Resource in the same organization", async () => {
    const { organization, owner } = await createTestOrganization();
    const staff = await createTestUser("Staff");
    const membership = await createMembership(
      organization.id,
      staff.id,
      "staff",
    );
    const first = await createTestResource(organization.id, owner.id, "First");
    const second = await createTestResource(
      organization.id,
      owner.id,
      "Second",
    );
    const input = {
      organizationId: organization.id,
      userId: owner.id,
      membershipId: membership.id,
    };
    expect(
      (await linkResourceToMember({ ...input, resourceId: first.id })).ok,
    ).toBe(true);

    expect(
      await linkResourceToMember({ ...input, resourceId: second.id }),
    ).toEqual({
      ok: false,
      reason: "member_resource_already_linked",
    });
    expect(
      await db
        .selectFrom("resource")
        .select(["id", "user_id"])
        .orderBy("name")
        .execute(),
    ).toEqual([
      { id: first.id, user_id: staff.id },
      { id: second.id, user_id: null },
    ]);
  });

  it("enforces Resource link uniqueness in PostgreSQL, scoped to each organization", async () => {
    const { organization, owner } = await createTestOrganization();
    const other = await createTestOrganization();
    const first = await createTestResource(organization.id, owner.id, "First");
    const second = await createTestResource(
      organization.id,
      owner.id,
      "Second",
    );
    const elsewhere = await createTestResource(
      other.organization.id,
      other.owner.id,
      "Elsewhere",
    );
    await createMembership(other.organization.id, owner.id, "staff");
    await db
      .updateTable("resource")
      .set({ user_id: owner.id })
      .where("id", "in", [first.id, elsewhere.id])
      .execute();

    await expect(
      db
        .updateTable("resource")
        .set({ user_id: owner.id })
        .where("id", "=", second.id)
        .execute(),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "resource_organization_user_unique",
    });
    expect(
      await db
        .selectFrom("resource")
        .select(["id", "user_id"])
        .orderBy("name")
        .execute(),
    ).toEqual([
      { id: elsewhere.id, user_id: owner.id },
      { id: first.id, user_id: owner.id },
      { id: second.id, user_id: null },
    ]);
  });
});
