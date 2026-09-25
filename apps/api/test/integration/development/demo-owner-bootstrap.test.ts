import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import { demoOrganization } from "../../../src/development/demo-organization.js";
import {
  assertDemoOwnerBootstrapAllowed,
  type DemoOwnerBootstrapError,
  linkDemoOrganizationOwner,
} from "../../../src/development/link-demo-owner.js";
import {
  addTestMembership,
  createTestOrganization,
  createTestUser,
} from "../../helpers/factories.js";

async function createDemoOrganization() {
  return db
    .insertInto("organization")
    .values({
      id: demoOrganization.id,
      name: demoOrganization.name,
      slug: demoOrganization.slug,
      archived_at: null,
      published_at: null,
      suspended_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

function linkOwner(email: string) {
  return db
    .transaction()
    .execute((trx) => linkDemoOrganizationOwner(trx, email));
}

async function expectBootstrapError(
  promise: Promise<unknown>,
  code: DemoOwnerBootstrapError["code"],
) {
  await expect(promise).rejects.toMatchObject({
    name: "DemoOwnerBootstrapError",
    code,
  });
}

describe("development demo owner bootstrap", () => {
  it("fails for an unknown email", async () => {
    await createDemoOrganization();

    await expectBootstrapError(
      linkOwner("missing@example.test"),
      "user_not_found",
    );
  });

  it("fails for an unverified Better Auth user", async () => {
    await createDemoOrganization();
    const user = await createTestUser({ emailVerified: false });

    await expectBootstrapError(linkOwner(user.email), "email_not_verified");
  });

  it("normalizes email and makes a verified user an Owner", async () => {
    await createDemoOrganization();
    const user = await createTestUser({ email: "owner@example.test" });

    await linkOwner("  OWNER@EXAMPLE.TEST  ");

    await expect(
      db
        .selectFrom("membership")
        .select(["organization_id", "user_id", "role"])
        .where("organization_id", "=", demoOrganization.id)
        .where("user_id", "=", user.id)
        .executeTakeFirst(),
    ).resolves.toEqual({
      organization_id: demoOrganization.id,
      user_id: user.id,
      role: "owner",
    });
  });

  it("is idempotent when rerun", async () => {
    await createDemoOrganization();
    const user = await createTestUser();

    await linkOwner(user.email);
    await linkOwner(user.email);

    await expect(
      db
        .selectFrom("membership")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("organization_id", "=", demoOrganization.id)
        .where("user_id", "=", user.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ count: "1" });
  });

  it("promotes an existing demo membership without replacing it", async () => {
    const organization = await createDemoOrganization();
    const user = await createTestUser();
    const membership = await addTestMembership({
      organizationId: organization.id,
      userId: user.id,
      role: "staff",
    });

    await linkOwner(user.email);

    await expect(
      db
        .selectFrom("membership")
        .select(["id", "role"])
        .where("organization_id", "=", organization.id)
        .where("user_id", "=", user.id)
        .executeTakeFirst(),
    ).resolves.toEqual({ id: membership.id, role: "owner" });
  });

  it("leaves unrelated Organizations and memberships untouched", async () => {
    await createDemoOrganization();
    const user = await createTestUser();
    const unrelatedOrganization = await createTestOrganization();
    const unrelatedMembership = await addTestMembership({
      organizationId: unrelatedOrganization.id,
      userId: user.id,
      role: "manager",
    });

    await linkOwner(user.email);

    await expect(
      db
        .selectFrom("membership")
        .selectAll()
        .where("id", "=", unrelatedMembership.id)
        .executeTakeFirst(),
    ).resolves.toEqual(unrelatedMembership);
  });

  it("refuses to run in production", () => {
    expect(() => assertDemoOwnerBootstrapAllowed("production")).toThrowError(
      expect.objectContaining({
        name: "DemoOwnerBootstrapError",
        code: "production_forbidden",
      }),
    );
    expect(() => assertDemoOwnerBootstrapAllowed("development")).not.toThrow();
  });
});
