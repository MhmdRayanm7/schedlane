import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { type Kysely, sql } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import type { MembershipRole } from "../../src/db-types.js";
import { down, up } from "../../src/migrations/0010_create_resource_service.js";
import {
  createResource,
  deactivateResource,
} from "../../src/modules/resources/resource-service.js";
import { assignResourceToService } from "../../src/modules/services/resource-service-assignment-service.js";
import { serviceRoutes } from "../../src/modules/services/service-routes.js";
import {
  createService,
  deactivateService,
} from "../../src/modules/services/service-service.js";

// Stub only authentication; HTTP validation, domain operations and PostgreSQL are real.
vi.mock("../../src/http/auth-guard.js", () => ({
  requireVerifiedUser: async (request: {
    headers: Record<string, string>;
    verifiedUser: unknown;
  }) => {
    request.verifiedUser = { id: request.headers["x-test-user"] };
  },
}));

const app = Fastify();
await app.register(serviceRoutes);
afterAll(() => app.close());

async function fixture() {
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
      slug: `assignments-${randomUUID()}`,
      name: "Assignment organization",
      published_at: null,
      archived_at: null,
      suspended_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const organizationId = organization.id;
  await db
    .insertInto("membership")
    .values({
      organization_id: organizationId,
      user_id: userId,
      role: "owner",
    })
    .execute();
  const addService = async () => {
    const result = await createService({
      userId,
      organizationId,
      name: "Consultation",
      durationMinutes: 30,
      priceAgorot: null,
      bufferAfterMinutes: 0,
    });
    if (!result.ok) throw new Error(result.reason);
    return result.service.id;
  };
  const addResource = async (name = "Resource") => {
    const result = await createResource({ userId, organizationId, name });
    if (!result.ok) throw new Error(result.reason);
    return result.resource.id;
  };
  const serviceId = await addService();
  const resourceId = await addResource();
  const request = (
    method: "GET" | "PUT" | "DELETE",
    target: {
      organizationId?: string;
      serviceId?: string;
      resourceId?: string;
      userId?: string;
    } = {},
  ) =>
    app.inject({
      method,
      url: `/api/organizations/${target.organizationId ?? organizationId}/services/${target.serviceId ?? serviceId}/resources${method === "GET" ? "" : `/${target.resourceId ?? resourceId}`}`,
      headers: { "x-test-user": target.userId ?? userId },
    });
  const role = (role: MembershipRole) =>
    db
      .updateTable("membership")
      .set({ role })
      .where("user_id", "=", userId)
      .execute();
  const read = () =>
    db
      .selectFrom("resource_service")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("resource_id")
      .orderBy("service_id")
      .execute();
  return {
    userId,
    organizationId,
    serviceId,
    resourceId,
    addService,
    addResource,
    request,
    role,
    read,
  };
}

describe("Resource-Service assignments", () => {
  it("lets an Owner assign idempotently, retaining one relationship and its timestamp", async () => {
    const f = await fixture();
    const response = await f.request("PUT");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      serviceId: f.serviceId,
      resourceId: f.resourceId,
      assigned: true,
    });
    const before = await f.read();
    expect(before).toEqual([
      {
        organization_id: f.organizationId,
        service_id: f.serviceId,
        resource_id: f.resourceId,
        created_at: expect.any(Date),
      },
    ]);
    expect((await f.request("PUT")).statusCode).toBe(200);
    expect(await f.read()).toEqual(before);
  });

  it("serializes concurrent duplicate assignments", async () => {
    const f = await fixture();
    const results = await Promise.all([
      assignResourceToService(f),
      assignResourceToService(f),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await f.read()).toHaveLength(1);
  });

  it("supports many Resources per Service and many Services per Resource", async () => {
    const f = await fixture();
    const serviceId = await f.addService();
    const resourceId = await f.addResource();
    for (const target of [
      {},
      { serviceId },
      { resourceId },
      { serviceId, resourceId },
    ]) {
      expect((await f.request("PUT", target)).statusCode).toBe(200);
    }
    expect(await f.read()).toHaveLength(4);
    expect((await f.request("DELETE")).statusCode).toBe(200);
    expect(await f.read()).toHaveLength(3);
  });

  it("lets a Manager assign and idempotently unassign", async () => {
    const f = await fixture();
    await f.role("manager");
    expect((await f.request("PUT")).statusCode).toBe(200);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await f.request("DELETE");
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        serviceId: f.serviceId,
        resourceId: f.resourceId,
        assigned: false,
      });
      expect(await f.read()).toEqual([]);
    }
  });

  it("rejects Staff listing, assigning, and unassigning without changing mappings", async () => {
    const f = await fixture();
    const unassigned = await f.addResource();
    expect((await f.request("PUT")).statusCode).toBe(200);
    const before = await f.read();
    await f.role("staff");
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      const response = await f.request(method, {
        resourceId: method === "PUT" ? unassigned : f.resourceId,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("SERVICE_MANAGEMENT_NOT_ALLOWED");
      expect(await f.read()).toEqual(before);
    }
  });

  it.each(["owner", "manager"] as const)(
    "lists deterministic management results for %s, including inactive assignments",
    async (role) => {
      const f = await fixture();
      const zulu = await f.addResource("Zulu");
      const alpha1 = await f.addResource("Alpha");
      const alpha2 = await f.addResource("Alpha");
      // Insert in reverse order so the query must explicitly sort, including ties.
      for (const resourceId of [zulu, alpha2, alpha1]) {
        expect((await f.request("PUT", { resourceId })).statusCode).toBe(200);
      }
      expect((await deactivateResource({ ...f, resourceId: alpha1 })).ok).toBe(
        true,
      );
      expect((await deactivateService(f)).ok).toBe(true);
      await f.role(role);
      const response = await f.request("GET");
      expect(response.statusCode).toBe(200);
      const alphas = [alpha1, alpha2].sort().map((id) => ({
        id,
        name: "Alpha",
        deactivatedAt: id === alpha1 ? expect.any(String) : null,
      }));
      expect(response.json()).toEqual({
        items: [...alphas, { id: zulu, name: "Zulu", deactivatedAt: null }],
      });
    },
  );

  it("returns an empty management list for an unassigned Service", async () => {
    const f = await fixture();
    expect((await f.request("GET")).json()).toEqual({ items: [] });
  });

  it.each(["GET", "PUT", "DELETE"] as const)(
    "hides organization existence from non-members for %s",
    async (method) => {
      const f = await fixture();
      const other = await fixture();
      const response = await f.request(method, { userId: other.userId });
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe("ORGANIZATION_NOT_FOUND");
      expect(await f.read()).toEqual([]);
    },
  );

  it.each(["PUT", "DELETE"] as const)(
    "hides cross-organization and missing Resources for %s",
    async (method) => {
      const f = await fixture();
      const other = await fixture();
      for (const resourceId of [other.resourceId, randomUUID()]) {
        const response = await f.request(method, { resourceId });
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe("RESOURCE_NOT_FOUND");
      }
      expect(await f.read()).toEqual([]);
      expect(await other.read()).toEqual([]);
    },
  );

  it.each(["GET", "PUT", "DELETE"] as const)(
    "hides cross-organization and missing Services for %s",
    async (method) => {
      const f = await fixture();
      const other = await fixture();
      for (const serviceId of [other.serviceId, randomUUID()]) {
        const response = await f.request(method, { serviceId });
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe("SERVICE_NOT_FOUND");
      }
      expect(await f.read()).toEqual([]);
      expect(await other.read()).toEqual([]);
    },
  );

  it.each(["service", "resource"] as const)(
    "rejects new assignments to an inactive %s",
    async (entity) => {
      const f = await fixture();
      expect(
        (
          await (entity === "service"
            ? deactivateService(f)
            : deactivateResource(f))
        ).ok,
      ).toBe(true);
      const response = await f.request("PUT");
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe(`${entity.toUpperCase()}_INACTIVE`);
      expect(await f.read()).toEqual([]);
    },
  );

  it.each(["service", "resource", "both"] as const)(
    "preserves assignments after %s deactivation and allows idempotent removal",
    async (entity) => {
      const f = await fixture();
      expect((await f.request("PUT")).statusCode).toBe(200);
      const before = await f.read();
      if (entity !== "resource")
        expect((await deactivateService(f)).ok).toBe(true);
      if (entity !== "service")
        expect((await deactivateResource(f)).ok).toBe(true);
      expect(await f.read()).toEqual(before);
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await f.request("DELETE");
        expect(response.statusCode).toBe(200);
        expect(response.json().assigned).toBe(false);
        expect(await f.read()).toEqual([]);
      }
    },
  );

  it.each(["archived", "suspended"] as const)(
    "blocks writes in an %s organization but permits management reads",
    async (state) => {
      const f = await fixture();
      const unassigned = await f.addResource();
      expect((await f.request("PUT")).statusCode).toBe(200);
      const before = await f.read();
      await db
        .updateTable("organization")
        .set(
          state === "archived"
            ? { archived_at: new Date() }
            : { suspended_at: new Date() },
        )
        .where("id", "=", f.organizationId)
        .execute();
      for (const method of ["PUT", "DELETE"] as const) {
        const response = await f.request(method, {
          resourceId: method === "PUT" ? unassigned : f.resourceId,
        });
        expect(response.statusCode).toBe(409);
        expect(response.json().code).toBe(
          `ORGANIZATION_${state.toUpperCase()}`,
        );
        expect(await f.read()).toEqual(before);
      }
      const response = await f.request("GET");
      expect(response.statusCode).toBe(200);
      expect(response.json().items).toHaveLength(1);
    },
  );

  it.each(["resource", "service"] as const)(
    "rejects direct SQL crossing the %s composite foreign key",
    async (entity) => {
      const f = await fixture();
      const other = await fixture();
      await expect(
        db
          .insertInto("resource_service")
          .values({
            organization_id: f.organizationId,
            resource_id:
              entity === "resource" ? other.resourceId : f.resourceId,
            service_id: entity === "service" ? other.serviceId : f.serviceId,
          })
          .execute(),
      ).rejects.toMatchObject({
        code: "23503",
        constraint: `resource_service_${entity}_organization_fk`,
      });
      expect(await f.read()).toEqual([]);
      expect(await other.read()).toEqual([]);
    },
  );

  it("rejects duplicate pairs through the database primary key", async () => {
    const f = await fixture();
    expect((await f.request("PUT")).statusCode).toBe(200);
    await expect(
      db
        .insertInto("resource_service")
        .values({
          organization_id: f.organizationId,
          resource_id: f.resourceId,
          service_id: f.serviceId,
        })
        .execute(),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "resource_service_pkey",
    });
    expect(await f.read()).toHaveLength(1);
  });

  it.each(["resource", "service", "organization"] as const)(
    "cascades mapping removal when its %s is deleted",
    async (entity) => {
      const f = await fixture();
      expect((await f.request("PUT")).statusCode).toBe(200);
      const id =
        entity === "resource"
          ? f.resourceId
          : entity === "service"
            ? f.serviceId
            : f.organizationId;
      await db.deleteFrom(entity).where("id", "=", id).execute();
      expect(await f.read()).toEqual([]);
    },
  );

  it("reverses and reapplies the migration without changing parent rows or primary keys", async () => {
    const f = await fixture();
    const resource = await db.selectFrom("resource").selectAll().execute();
    const service = await db.selectFrom("service").selectAll().execute();
    expect((await f.request("PUT")).statusCode).toBe(200);
    // PostgreSQL transactional DDL restores the test schema even if an assertion fails.
    await db.transaction().execute(async (trx) => {
      // Migrations deliberately erase the application schema type as tables change.
      const migrationDb = trx as unknown as Kysely<unknown>;
      await down(migrationDb);
      const { rows } = await sql<{
        table_name: string | null;
        added_keys: string[];
        primary_keys: string[];
      }>`
        SELECT to_regclass('resource_service')::text AS table_name,
          ARRAY(SELECT conname::text FROM pg_constraint WHERE conname IN
            ('resource_id_organization_id_unique', 'service_id_organization_id_unique')) AS added_keys,
          ARRAY(SELECT conname::text FROM pg_constraint WHERE conname IN
            ('resource_pkey', 'service_pkey') ORDER BY conname) AS primary_keys
      `.execute(trx);
      expect(rows[0]).toEqual({
        table_name: null,
        added_keys: [],
        primary_keys: ["resource_pkey", "service_pkey"],
      });
      expect(await trx.selectFrom("resource").selectAll().execute()).toEqual(
        resource,
      );
      expect(await trx.selectFrom("service").selectAll().execute()).toEqual(
        service,
      );
      await up(migrationDb);
      await trx
        .insertInto("resource_service")
        .values({
          organization_id: f.organizationId,
          resource_id: f.resourceId,
          service_id: f.serviceId,
        })
        .execute();
    });
    expect(await f.read()).toHaveLength(1);
  });

  it.each(["GET", "PUT", "DELETE"] as const)(
    "validates UUID parameters for %s",
    async (method) => {
      const f = await fixture();
      const targets: Array<{
        organizationId?: string;
        serviceId?: string;
        resourceId?: string;
      }> = [{ organizationId: "invalid" }, { serviceId: "invalid" }];
      if (method !== "GET") targets.push({ resourceId: "invalid" });
      for (const target of targets)
        expect((await f.request(method, target)).statusCode).toBe(400);
      expect(await f.read()).toEqual([]);
    },
  );
});
