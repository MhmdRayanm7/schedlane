import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import type { MembershipRole } from "../../src/db-types.js";
import { serviceRoutes } from "../../src/modules/services/service-routes.js";
import {
  createService,
  deactivateService,
} from "../../src/modules/services/service-service.js";

// Stub only authentication; routes, authorization, transactions and storage are real.
vi.mock("../../src/http/auth-guard.js", () => ({
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
await app.register(serviceRoutes);
afterAll(() => app.close());

async function fixture(pricingEnabled = false) {
  const userId = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: userId,
      name: "Owner",
      email: `${userId}@example.test`,
      emailVerified: true,
      image: null,
    })
    .execute();
  const organization = await db
    .insertInto("organization")
    .values({
      slug: `service-${randomUUID()}`,
      name: "Service organization",
      pricing_enabled: pricingEnabled,
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
      user_id: userId,
      role: "owner",
    })
    .execute();
  const created = await createService({
    userId,
    organizationId: organization.id,
    name: "Consultation",
    durationMinutes: 30,
    priceAgorot: pricingEnabled ? 5000 : null,
    bufferAfterMinutes: 10,
  });
  if (!created.ok) throw new Error(created.reason);
  const serviceId = created.service.id;
  const read = () =>
    db
      .selectFrom("service")
      .selectAll()
      .where("id", "=", serviceId)
      .executeTakeFirstOrThrow();
  const patch = (
    payload: object,
    targetServiceId = serviceId,
    targetOrganizationId = organization.id,
  ) =>
    app.inject({
      method: "PATCH",
      url: `/api/organizations/${targetOrganizationId}/services/${targetServiceId}`,
      headers: { "x-test-user": userId },
      payload,
    });
  const role = (role: MembershipRole) =>
    db
      .updateTable("membership")
      .set({ role })
      .where("user_id", "=", userId)
      .execute();
  return {
    userId,
    organizationId: organization.id,
    serviceId,
    read,
    patch,
    role,
  };
}

describe("Service updates", () => {
  it("lets an Owner partially update and trim the name while preserving omitted fields", async () => {
    const f = await fixture(true);
    const before = await f.read();
    const response = await f.patch({ name: "  Follow-up  " });
    expect(response.statusCode).toBe(200);
    const after = await f.read();
    expect(after).toEqual({
      ...before,
      name: "Follow-up",
      updated_at: expect.any(Date),
    });
    expect(after.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
    expect(response.json()).toEqual({
      id: before.id,
      name: "Follow-up",
      durationMinutes: 30,
      priceAgorot: 5000,
      bufferAfterMinutes: 10,
      displayOrder: before.display_order,
      deactivatedAt: null,
      createdAt: before.created_at.toISOString(),
      updatedAt: after.updated_at.toISOString(),
    });
  });

  it("lets a Manager update duration and buffer including zero", async () => {
    const f = await fixture();
    await f.role("manager");
    expect(
      (await f.patch({ durationMinutes: 1, bufferAfterMinutes: 0 })).statusCode,
    ).toBe(200);
    expect(await f.read()).toMatchObject({
      duration_minutes: 1,
      buffer_after_minutes: 0,
    });
  });

  it("rejects Staff without changing the Service", async () => {
    const f = await fixture();
    await f.role("staff");
    const before = await f.read();
    const response = await f.patch({ name: "Forbidden" });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("SERVICE_MANAGEMENT_NOT_ALLOWED");
    expect(await f.read()).toEqual(before);
  });

  it("hides Services belonging to another organization", async () => {
    const f = await fixture();
    const other = await fixture();
    const before = await other.read();
    const response = await f.patch({ name: "Forbidden" }, other.serviceId);
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("SERVICE_NOT_FOUND");
    expect(await other.read()).toEqual(before);
  });

  it("returns Service not found for a missing Service", async () => {
    const f = await fixture();
    const response = await f.patch({ name: "Missing" }, randomUUID());
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("SERVICE_NOT_FOUND");
  });

  it("hides an organization without actor membership", async () => {
    const f = await fixture();
    const response = await f.patch(
      { name: "Missing" },
      f.serviceId,
      randomUUID(),
    );
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("ORGANIZATION_NOT_FOUND");
  });

  it("rejects non-null prices when pricing is disabled", async () => {
    const f = await fixture();
    const before = await f.read();
    const response = await f.patch({ priceAgorot: 0 });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_PRICING_DISABLED");
    expect(await f.read()).toEqual(before);
  });

  it("rejects explicit null with pricing enabled and accepts a non-null price", async () => {
    const f = await fixture(true);
    const before = await f.read();
    const response = await f.patch({ priceAgorot: null, name: "Rejected" });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SERVICE_PRICE_REQUIRED");
    expect(await f.read()).toEqual(before);
    expect((await f.patch({ priceAgorot: 0 })).statusCode).toBe(200);
    expect(await f.read()).toMatchObject({ price_agorot: 0 });
  });

  it("validates a retained null price against enabled organization pricing", async () => {
    const f = await fixture();
    await db
      .updateTable("organization")
      .set({ pricing_enabled: true })
      .where("id", "=", f.organizationId)
      .execute();
    const before = await f.read();
    const response = await f.patch({ name: "Rejected" });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SERVICE_PRICE_REQUIRED");
    expect(await f.read()).toEqual(before);
    expect((await f.patch({ priceAgorot: 100 })).statusCode).toBe(200);
  });

  it("validates a retained non-null price when disabled and allows explicitly clearing it", async () => {
    const f = await fixture(true);
    await db
      .updateTable("organization")
      .set({ pricing_enabled: false })
      .where("id", "=", f.organizationId)
      .execute();
    const before = await f.read();
    const response = await f.patch({ name: "Rejected" });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_PRICING_DISABLED");
    expect(await f.read()).toEqual(before);
    expect((await f.patch({ priceAgorot: null })).statusCode).toBe(200);
    expect(await f.read()).toMatchObject({ price_agorot: null });
  });

  it("preserves deactivation when editing a deactivated Service", async () => {
    const f = await fixture();
    expect((await deactivateService(f)).ok).toBe(true);
    const before = await f.read();
    expect(before.deactivated_at).not.toBeNull();
    const response = await f.patch({ name: "Updated inactive Service" });
    expect(response.statusCode).toBe(200);
    expect(response.json().deactivatedAt).toBe(
      before.deactivated_at?.toISOString(),
    );
    expect(await f.read()).toEqual({
      ...before,
      name: "Updated inactive Service",
      updated_at: expect.any(Date),
    });
  });

  it.each(["archived", "suspended"] as const)(
    "rejects an %s organization without changes",
    async (state) => {
      const f = await fixture();
      await db
        .updateTable("organization")
        .set(
          state === "archived"
            ? { archived_at: new Date() }
            : { suspended_at: new Date() },
        )
        .where("id", "=", f.organizationId)
        .execute();
      const before = await f.read();
      const response = await f.patch({ name: "Rejected" });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe(`ORGANIZATION_${state.toUpperCase()}`);
      expect(await f.read()).toEqual(before);
    },
  );

  it("accepts identical values and advances updated_at without changing created_at", async () => {
    const f = await fixture();
    const before = await f.read();
    expect((await f.patch({ name: before.name })).statusCode).toBe(200);
    const after = await f.read();
    expect(after).toEqual({ ...before, updated_at: expect.any(Date) });
    expect(after.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
  });

  it.each([
    {},
    { name: "" },
    { name: "   " },
    { name: "a".repeat(121) },
    { name: null },
    { durationMinutes: 0 },
    { durationMinutes: 1.5 },
    { priceAgorot: -1 },
    { priceAgorot: 0.5 },
    { bufferAfterMinutes: -1 },
    { bufferAfterMinutes: 0.5 },
    { displayOrder: 10 },
    { deactivatedAt: null },
    { organizationId: randomUUID() },
    { createdAt: new Date().toISOString() },
    { updatedAt: new Date().toISOString() },
    { lifecycleState: "active" },
    { name: "Valid", displayOrder: 10 },
  ])("rejects invalid or forbidden PATCH body %j", async (body) => {
    const f = await fixture();
    const before = await f.read();
    expect((await f.patch(body)).statusCode).toBe(400);
    expect(await f.read()).toEqual(before);
  });
});
