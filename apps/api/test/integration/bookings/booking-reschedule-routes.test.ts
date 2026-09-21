import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/db.js";
import type { BookingStatus, MembershipRole } from "../../../src/db-types.js";
import { bookingRoutes } from "../../../src/modules/bookings/http/management-routes.js";
import {
  addTestMembership,
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

vi.mock("../../../src/http/auth-guard.js", () => ({
  requireVerifiedUser: async (
    request: {
      headers: Record<string, string | undefined>;
      id: string;
      verifiedUser: unknown;
    },
    reply: {
      code: (status: number) => { send: (body: unknown) => unknown };
    },
  ) => {
    const userId = request.headers["x-test-user"];
    if (!userId)
      return reply.code(401).send({
        code: "UNAUTHORIZED",
        message: "Authentication required",
        requestId: request.id,
      });
    request.verifiedUser = { id: userId, email: "member@example.test" };
  },
}));

const now = new Date("2026-10-05T05:00:00.000Z");
const app = Fastify();
await app.register(bookingRoutes, { now: () => now });
afterAll(() => app.close());

async function fixture({
  role = "owner",
  status = "confirmed",
  sourceLinked = role === "staff",
  targetDeactivated = false,
}: {
  role?: MembershipRole;
  status?: BookingStatus;
  sourceLinked?: boolean;
  targetDeactivated?: boolean;
} = {}) {
  const actor = await createTestUser();
  const organization = await createTestOrganization();
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role,
  });
  const source = await createTestResource({
    organizationId: organization.id,
    userId: sourceLinked ? actor.id : null,
    name: "HTTP source",
  });
  const target = await createTestResource({
    organizationId: organization.id,
    name: "HTTP target",
    deactivatedAt: targetDeactivated ? new Date() : null,
  });
  const service = await createTestService({
    organizationId: organization.id,
    durationMinutes: 30,
    bufferAfterMinutes: 10,
    priceAgorot: 8000,
  });
  const booking = await createTestBooking({
    organizationId: organization.id,
    resourceId: source.id,
    serviceId: service.id,
    publicReference: `HTTP-MOVE-${randomUUID()}`,
    status,
    startAt: new Date("2026-10-05T06:00:00.000Z"),
    durationMinutes: 30,
    bufferAfterMinutes: 10,
    priceAgorot: 8000,
    cancelledAt: status === "cancelled" ? now : null,
    cancelledByUserId: status === "cancelled" ? actor.id : null,
  });
  const payload = {
    resourceId: target.id,
    date: "2026-10-05",
    startMinute: 660,
  };
  const post = (
    options: {
      payload?: unknown;
      userId?: string | null;
      organizationId?: string;
      bookingId?: string;
    } = {},
  ) =>
    app.inject({
      method: "POST",
      url: `/api/organizations/${options.organizationId ?? organization.id}/bookings/${options.bookingId ?? booking.id}/reschedule`,
      headers:
        options.userId === null
          ? {}
          : { "x-test-user": options.userId ?? actor.id },
      payload: options.payload ?? payload,
    });
  return {
    actor,
    organization,
    source,
    target,
    service,
    booking,
    payload,
    post,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function configure(f: Fixture, resourceIds = [f.source.id, f.target.id]) {
  await db
    .insertInto("organization_weekly_hours")
    .values({
      organization_id: f.organization.id,
      weekday: 1,
      start_minute: 540,
      end_minute: 900,
    })
    .execute();
  await db
    .insertInto("resource_service")
    .values(
      resourceIds.map((resourceId) => ({
        organization_id: f.organization.id,
        resource_id: resourceId,
        service_id: f.service.id,
      })),
    )
    .execute();
}

function expectError(
  response: { statusCode: number; json: () => unknown },
  statusCode: number,
  code: string,
) {
  expect(response.statusCode).toBe(statusCode);
  expect(response.json()).toMatchObject({
    code,
    message: expect.any(String),
    requestId: expect.any(String),
  });
}

describe("Booking reschedule management HTTP", () => {
  it.each(["owner", "manager"] as const)(
    "lets an authenticated %s change Resource and returns the focused DTO",
    async (role) => {
      const f = await fixture({ role });
      await configure(f);
      const response = await f.post();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: f.booking.id,
        publicReference: f.booking.public_reference,
        status: "confirmed",
        resourceId: f.target.id,
        serviceId: f.service.id,
        startAt: "2026-10-05T08:00:00.000Z",
        serviceEndAt: "2026-10-05T08:30:00.000Z",
        occupiedUntilAt: "2026-10-05T08:40:00.000Z",
        durationMinutes: 30,
        bufferAfterMinutes: 10,
        priceAgorot: 8000,
        updatedAt: now.toISOString(),
      });
    },
  );

  it("applies Staff permission to both source and target Resources", async () => {
    const own = await fixture({ role: "staff" });
    await configure(own, [own.source.id]);
    expect(
      (
        await own.post({
          payload: { ...own.payload, resourceId: own.source.id },
        })
      ).statusCode,
    ).toBe(200);

    const otherSource = await fixture({
      role: "staff",
      sourceLinked: false,
    });
    await configure(otherSource);
    expectError(await otherSource.post(), 403, "INSUFFICIENT_ROLE");

    const otherTarget = await fixture({ role: "staff" });
    await configure(otherTarget);
    expectError(await otherTarget.post(), 403, "INSUFFICIENT_ROLE");
  });

  it("requires auth and preserves tenant anti-leak responses", async () => {
    const f = await fixture();
    await configure(f);
    expectError(await f.post({ userId: null }), 401, "UNAUTHORIZED");
    expectError(
      await f.post({ userId: randomUUID() }),
      404,
      "ORGANIZATION_NOT_FOUND",
    );
    const other = await fixture();
    expectError(
      await f.post({ bookingId: other.booking.id }),
      404,
      "BOOKING_NOT_FOUND",
    );
    expectError(
      await f.post({
        payload: { ...f.payload, resourceId: other.target.id },
      }),
      404,
      "RESOURCE_NOT_FOUND",
    );
  });

  it.each([
    { organizationId: "invalid" },
    { bookingId: "invalid" },
    {
      payload: { resourceId: "invalid", date: "2026-10-05", startMinute: 660 },
    },
    { payload: { date: "2026-10-05", startMinute: 660 } },
    { payload: { resourceId: randomUUID(), startMinute: 660 } },
    { payload: { resourceId: randomUUID(), date: "2026-10-05" } },
    {
      payload: {
        resourceId: randomUUID(),
        date: "2026-10-05",
        startMinute: 660,
        serviceId: randomUUID(),
      },
    },
    {
      payload: {
        resourceId: randomUUID(),
        date: "2026-10-05",
        startMinute: -1,
      },
    },
    {
      payload: {
        resourceId: randomUUID(),
        date: "2026-10-05",
        startMinute: 1440,
      },
    },
    {
      payload: {
        resourceId: randomUUID(),
        date: "2026-10-05",
        startMinute: 1.5,
      },
    },
    {
      payload: {
        resourceId: randomUUID(),
        date: "2026-10-05",
        startMinute: "660",
      },
    },
  ])("rejects malformed params/body %#", async (options) => {
    const f = await fixture();
    expect((await f.post(options)).statusCode).toBe(400);
  });

  it("maps invalid dates and DST-invalid local starts", async () => {
    const f = await fixture();
    expectError(
      await f.post({ payload: { ...f.payload, date: "2026-02-30" } }),
      400,
      "INVALID_DATE",
    );
    expectError(
      await f.post({
        payload: { ...f.payload, date: "2026-03-27", startMinute: 120 },
      }),
      400,
      "INVALID_START_TIME",
    );
  });

  it("allows a same-Resource new-time reschedule", async () => {
    const f = await fixture();
    await configure(f);
    const response = await f.post({
      payload: { ...f.payload, resourceId: f.source.id, startMinute: 600 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resourceId: f.source.id,
      startAt: "2026-10-05T07:00:00.000Z",
    });
  });

  it("maps past and non-confirmed targets", async () => {
    const past = await fixture();
    await configure(past);
    expectError(
      await past.post({
        payload: { ...past.payload, startMinute: 479 },
      }),
      409,
      "RESCHEDULE_START_IN_PAST",
    );
    for (const status of ["cancelled", "no_show"] as const) {
      const f = await fixture({ status });
      await configure(f);
      expectError(await f.post(), 409, "INVALID_BOOKING_STATUS");
    }
  });

  it.each([
    ["archived_at", "ORGANIZATION_ARCHIVED"],
    ["suspended_at", "ORGANIZATION_SUSPENDED"],
  ] as const)("maps %s write state", async (column, code) => {
    const f = await fixture();
    await configure(f);
    await db
      .updateTable("organization")
      .set({ [column]: new Date() })
      .where("id", "=", f.organization.id)
      .execute();
    expectError(await f.post(), 409, code);
  });

  it("maps inactive target and missing assignment", async () => {
    const inactive = await fixture({ targetDeactivated: true });
    await configure(inactive);
    expectError(await inactive.post(), 409, "RESOURCE_INACTIVE");

    const unassigned = await fixture();
    await configure(unassigned, [unassigned.source.id]);
    expectError(await unassigned.post(), 409, "SERVICE_NOT_ASSIGNED");
  });

  it("normalizes configured and occupied targets to SLOT_UNAVAILABLE", async () => {
    const blocked = await fixture();
    await configure(blocked);
    await db
      .insertInto("resource_time_block")
      .values({
        organization_id: blocked.organization.id,
        resource_id: blocked.target.id,
        local_date: "2026-10-05",
        start_minute: 660,
        end_minute: 700,
      })
      .execute();
    expectError(await blocked.post(), 409, "SLOT_UNAVAILABLE");

    const occupied = await fixture();
    await configure(occupied);
    await createTestBooking({
      organizationId: occupied.organization.id,
      resourceId: occupied.target.id,
      serviceId: occupied.service.id,
      publicReference: `HTTP-BLOCK-${randomUUID()}`,
      startAt: new Date("2026-10-05T08:00:00.000Z"),
      durationMinutes: 30,
      bufferAfterMinutes: 0,
    });
    expectError(await occupied.post(), 409, "SLOT_UNAVAILABLE");
  });

  it("retains Booking timing and price snapshots through the route", async () => {
    const f = await fixture();
    await configure(f);
    await db
      .updateTable("service")
      .set({
        duration_minutes: 60,
        buffer_after_minutes: 20,
        price_agorot: 10000,
      })
      .where("id", "=", f.service.id)
      .execute();
    const response = await f.post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      serviceId: f.service.id,
      durationMinutes: 30,
      bufferAfterMinutes: 10,
      priceAgorot: 8000,
      serviceEndAt: "2026-10-05T08:30:00.000Z",
      occupiedUntilAt: "2026-10-05T08:40:00.000Z",
    });
    expect(
      await db
        .selectFrom("booking")
        .select([
          "service_id",
          "duration_minutes",
          "buffer_after_minutes",
          "price_agorot",
        ])
        .where("id", "=", f.booking.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      service_id: f.service.id,
      duration_minutes: 30,
      buffer_after_minutes: 10,
      price_agorot: 8000,
    });
  });
});
