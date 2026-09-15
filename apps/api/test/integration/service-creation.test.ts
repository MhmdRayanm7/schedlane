import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { serviceRoutes } from "../../src/modules/services/service-routes.js";

// Stub only authentication; HTTP validation, authorization and PostgreSQL are real.
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

async function fixture(pricingEnabled: boolean) {
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
      slug: `service-creation-${randomUUID()}`,
      name: "Service creation organization",
      pricing_enabled: pricingEnabled,
      published_at: null,
      archived_at: null,
      suspended_at: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("membership")
    .values({
      organization_id: organization.id,
      user_id: userId,
      role: "owner",
    })
    .execute();

  const post = (priceAgorot: number | null) =>
    app.inject({
      method: "POST",
      url: `/api/organizations/${organization.id}/services`,
      headers: { "x-test-user": userId },
      payload: {
        name: "Haircut",
        durationMinutes: 30,
        priceAgorot,
      },
    });
  const read = () =>
    db
      .selectFrom("service")
      .selectAll()
      .where("organization_id", "=", organization.id)
      .execute();

  return { post, read };
}

describe("Service creation pricing", () => {
  it("preserves explicit null when pricing is disabled", async () => {
    const f = await fixture(false);
    const response = await f.post(null);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: "Haircut",
      durationMinutes: 30,
      priceAgorot: null,
      bufferAfterMinutes: 0,
    });
    expect(await f.read()).toMatchObject([{ price_agorot: null }]);
  });

  it("preserves explicit null for the pricing-enabled domain check", async () => {
    const f = await fixture(true);
    const response = await f.post(null);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SERVICE_PRICE_REQUIRED");
    expect(await f.read()).toEqual([]);
  });

  it.each([0, 4500])(
    "preserves the numeric price %i when pricing is enabled",
    async (priceAgorot) => {
      const f = await fixture(true);
      const response = await f.post(priceAgorot);

      expect(response.statusCode).toBe(201);
      expect(response.json().priceAgorot).toBe(priceAgorot);
      expect(await f.read()).toMatchObject([{ price_agorot: priceAgorot }]);
    },
  );

  it("rejects a non-null price when pricing is disabled", async () => {
    const f = await fixture(false);
    const response = await f.post(4500);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_PRICING_DISABLED");
    expect(await f.read()).toEqual([]);
  });

  it("rejects a negative price at the HTTP validation boundary", async () => {
    const f = await fixture(true);
    const response = await f.post(-1);

    expect(response.statusCode).toBe(400);
    expect(await f.read()).toEqual([]);
  });
});
