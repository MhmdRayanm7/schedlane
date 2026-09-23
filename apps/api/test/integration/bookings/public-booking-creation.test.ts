import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { config } from "../../../src/config.js";
import { db } from "../../../src/db.js";
import type { BookingStatus } from "../../../src/db-types.js";
import { availabilityRoutes } from "../../../src/modules/availability/http/management-routes.js";
import {
  createPublicBooking,
  publicBookingTestInternals,
} from "../../../src/modules/bookings/application/create-public-booking.js";
import { updateGuestManagedBookingContact } from "../../../src/modules/bookings/application/guest/write.js";
import {
  decryptGuestManagementToken,
  generateGuestManagementToken,
  hashGuestManagementToken,
} from "../../../src/modules/bookings/domain/management-token.js";
import { publicBookingRoutes } from "../../../src/modules/bookings/http/public-routes.js";
import {
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
} from "../../helpers/factories.js";

const date = "2026-10-05";
const now = new Date("2026-10-05T05:00:00.000Z");
const app = Fastify();
await app.register(publicBookingRoutes, { now: () => now });
await app.register(availabilityRoutes);
afterAll(() => app.close());

type FixtureOptions = {
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  suspendedAt?: Date | null;
  publicBookingPaused?: boolean;
  resourceDeactivatedAt?: Date | null;
  serviceDeactivatedAt?: Date | null;
  minBookingNoticeMinutes?: number;
  maxBookingHorizonDays?: number;
  pricingEnabled?: boolean;
  priceAgorot?: number | null;
  durationMinutes?: number;
  bufferAfterMinutes?: number;
  slotIntervalMinutes?: number;
  cancellationCutoffMinutes?: number;
};

async function fixture({
  publishedAt = new Date("2026-09-01T00:00:00.000Z"),
  archivedAt = null,
  suspendedAt = null,
  publicBookingPaused = false,
  resourceDeactivatedAt = null,
  serviceDeactivatedAt = null,
  minBookingNoticeMinutes = 0,
  maxBookingHorizonDays = 60,
  pricingEnabled = false,
  priceAgorot = null,
  durationMinutes = 30,
  bufferAfterMinutes = 0,
  slotIntervalMinutes = 15,
  cancellationCutoffMinutes = 0,
}: FixtureOptions = {}) {
  const organization = await createTestOrganization({
    publishedAt,
    archivedAt,
    suspendedAt,
    publicBookingPaused,
    minBookingNoticeMinutes,
    maxBookingHorizonDays,
    pricingEnabled,
    cancellationCutoffMinutes,
  });
  await db
    .updateTable("organization")
    .set({ slot_interval_minutes: slotIntervalMinutes })
    .where("id", "=", organization.id)
    .execute();
  const resource = await createTestResource({
    organizationId: organization.id,
    deactivatedAt: resourceDeactivatedAt,
  });
  const service = await createTestService({
    organizationId: organization.id,
    deactivatedAt: serviceDeactivatedAt,
    priceAgorot,
    durationMinutes,
    bufferAfterMinutes,
  });
  const body = {
    resourceId: resource.id,
    serviceId: service.id,
    date,
    startMinute: 540,
    guestName: "Guest",
    guestPhone: "050-123-4567",
  };
  return {
    organization,
    resource,
    service,
    body,
    request: (overrides: Partial<typeof body> & Record<string, unknown> = {}) =>
      app.inject({
        method: "POST",
        url: `/api/public/organizations/${organization.slug}/bookings`,
        payload: { ...body, ...overrides },
      }),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function configure(
  f: Fixture,
  {
    startMinute = 480,
    endMinute = 720,
    assign = true,
  }: { startMinute?: number; endMinute?: number; assign?: boolean } = {},
) {
  await db
    .insertInto("organization_weekly_hours")
    .values({
      organization_id: f.organization.id,
      weekday: 1,
      start_minute: startMinute,
      end_minute: endMinute,
    })
    .execute();
  if (assign)
    await db
      .insertInto("resource_service")
      .values({
        organization_id: f.organization.id,
        resource_id: f.resource.id,
        service_id: f.service.id,
      })
      .execute();
}

async function addBooking(
  f: Fixture,
  status: BookingStatus,
  overrides: Partial<Parameters<typeof createTestBooking>[0]> = {},
) {
  return createTestBooking({
    organizationId: f.organization.id,
    resourceId: f.resource.id,
    serviceId: f.service.id,
    publicReference: `TEST-${randomUUID()}`,
    startAt: new Date("2026-10-05T06:00:00.000Z"),
    durationMinutes: 30,
    bufferAfterMinutes: 0,
    status,
    cancelledAt:
      status === "cancelled" ? new Date("2026-10-04T00:00:00.000Z") : null,
    ...overrides,
  });
}

const expectNotFound = (response: {
  statusCode: number;
  json: () => unknown;
}) => {
  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({
    code: "PUBLIC_BOOKING_NOT_FOUND",
    requestId: expect.any(String),
  });
  expect(JSON.stringify(response.json())).not.toMatch(
    /unpublished|archived|suspended|paused|inactive|unassigned/i,
  );
};

describe("public guest Booking creation", () => {
  it("snapshots the Organization cancellation cutoff", async () => {
    const f = await fixture({ cancellationCutoffMinutes: 60 });
    await configure(f);
    expect((await f.request()).statusCode).toBe(201);
    const first = await db
      .selectFrom("booking")
      .select("cancellation_cutoff_minutes")
      .executeTakeFirstOrThrow();
    expect(first.cancellation_cutoff_minutes).toBe(60);
    await db
      .updateTable("organization")
      .set({ cancellation_cutoff_minutes: 1440 })
      .where("id", "=", f.organization.id)
      .execute();
    expect(first.cancellation_cutoff_minutes).toBe(60);
    expect((await f.request({ startMinute: 570 })).statusCode).toBe(201);
    expect(
      await db
        .selectFrom("booking")
        .select("cancellation_cutoff_minutes")
        .orderBy("start_at")
        .execute(),
    ).toEqual([
      { cancellation_cutoff_minutes: 60 },
      { cancellation_cutoff_minutes: 1440 },
    ]);
  });

  it("creates a confirmed Booking without a session and returns only public confirmation data", async () => {
    const f = await fixture();
    await configure(f);
    const response = await f.request({
      guestName: "  Public guest  ",
      guestPhone: "  050-123-4567  ",
      guestEmail: "  guest@example.test  ",
      customerNote: "Keep this note unchanged  ",
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      publicReference: expect.stringMatching(
        /^BK-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/,
      ),
      status: "confirmed",
      resourceId: f.resource.id,
      serviceId: f.service.id,
      startAt: "2026-10-05T06:00:00.000Z",
      priceAgorot: null,
      managementToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(response.json().publicReference).not.toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers["set-cookie"]).toBeUndefined();
    const booking = await db
      .selectFrom("booking")
      .select([
        "id",
        "organization_id",
        "resource_id",
        "service_id",
        "public_reference",
        "status",
        "start_at",
        "service_end_at",
        "duration_minutes",
        "price_agorot",
        "guest_name",
        "guest_phone",
        "guest_email",
        "customer_note",
        "guest_management_token_hash",
      ])
      .executeTakeFirstOrThrow();
    expect(booking).toMatchObject({
      status: "confirmed",
      guest_name: "Public guest",
      guest_phone: "+972501234567",
      guest_email: "guest@example.test",
      customer_note: "Keep this note unchanged  ",
      guest_management_token_hash: hashGuestManagementToken(
        response.json().managementToken,
      ),
    });
    const event = await db
      .selectFrom("outbox_event")
      .selectAll()
      .where("aggregate_id", "=", booking.id)
      .executeTakeFirstOrThrow();
    expect(event).toMatchObject({
      aggregate_type: "booking",
      aggregate_id: booking.id,
      event_type: "booking.created",
      occurred_at: now,
      published_at: null,
      payload: {
        bookingId: booking.id,
        organizationId: f.organization.id,
        publicReference: booking.public_reference,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        startAt: booking.start_at.toISOString(),
        serviceEndAt: booking.service_end_at.toISOString(),
        durationMinutes: 30,
        priceAgorot: null,
        guestName: "Public guest",
        guestPhone: "+972501234567",
        guestEmail: "guest@example.test",
      },
    });
    expect(JSON.stringify(event.payload)).not.toContain(
      response.json().managementToken,
    );
    const serializedPayload = JSON.stringify(event.payload);
    for (const secretField of [
      "managementToken",
      "guestManagementToken",
      "guestManagementTokenHash",
      "guest_management_token_hash",
    ])
      expect(serializedPayload).not.toContain(secretField);
    expect(serializedPayload).not.toMatch(/token|hash/i);
  });

  it("keeps the created payload as an immutable event-time snapshot", async () => {
    const f = await fixture();
    await configure(f);
    const response = await f.request({
      guestName: "Original guest",
      guestPhone: "050-123-4567",
      guestEmail: "original@example.test",
    });
    const managementToken = response.json().managementToken as string;
    const booking = await db
      .selectFrom("booking")
      .select("id")
      .executeTakeFirstOrThrow();
    const originalEvent = await db
      .selectFrom("outbox_event")
      .select(["id", "payload"])
      .where("aggregate_id", "=", booking.id)
      .executeTakeFirstOrThrow();

    expect(
      await updateGuestManagedBookingContact(
        {
          token: managementToken,
          guestName: "Updated guest",
          guestPhone: "052-765-4321",
          guestEmail: "updated@example.test",
        },
        now,
      ),
    ).toMatchObject({ ok: true });

    expect(
      await db
        .selectFrom("outbox_event")
        .select(["id", "payload"])
        .where("aggregate_id", "=", booking.id)
        .execute(),
    ).toEqual([originalEvent]);
    expect(originalEvent.payload).toMatchObject({
      guestName: "Original guest",
      guestPhone: "+972501234567",
      guestEmail: "original@example.test",
    });
  });

  it("issues different raw tokens while persisting their hashes and encrypted envelopes", async () => {
    const f = await fixture();
    await configure(f);
    const first = await f.request({ startMinute: 540 });
    const second = await f.request({ startMinute: 570 });
    const firstToken = first.json().managementToken as string;
    const secondToken = second.json().managementToken as string;
    expect(firstToken).not.toBe(secondToken);
    const credentials = await db
      .selectFrom("booking")
      .select([
        "guest_management_token_hash",
        "guest_management_token_encrypted",
      ])
      .orderBy("start_at")
      .execute();

    expect(credentials).toHaveLength(2);
    expect(credentials[0]?.guest_management_token_hash).toBe(
      hashGuestManagementToken(firstToken),
    );
    expect(credentials[1]?.guest_management_token_hash).toBe(
      hashGuestManagementToken(secondToken),
    );
    expect(credentials[0]?.guest_management_token_encrypted).not.toBe(
      firstToken,
    );
    expect(credentials[0]?.guest_management_token_encrypted).not.toBe(
      credentials[0]?.guest_management_token_hash,
    );

    const firstEncrypted = credentials[0]?.guest_management_token_encrypted;
    const secondEncrypted = credentials[1]?.guest_management_token_encrypted;
    expect(firstEncrypted).toBeTruthy();
    expect(secondEncrypted).toBeTruthy();

    const decryptedFirst = decryptGuestManagementToken(
      firstEncrypted ?? "",
      config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY,
    );
    const decryptedSecond = decryptGuestManagementToken(
      secondEncrypted ?? "",
      config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY,
    );
    expect(decryptedFirst).toBe(firstToken);
    expect(decryptedSecond).toBe(secondToken);
  });

  it("retries token-hash collisions with a fresh credential and bounds exhaustion", async () => {
    const f = await fixture();
    await configure(f);
    const collidingToken = generateGuestManagementToken();
    await addBooking(f, "cancelled", {
      startAt: new Date("2026-10-05T05:00:00Z"),
      guestManagementTokenHash: hashGuestManagementToken(collidingToken),
    });
    const freshToken = generateGuestManagementToken();
    const generated = [collidingToken, freshToken];
    const input = {
      organizationSlug: f.organization.slug,
      ...f.body,
    };
    const result = await createPublicBooking(input, now, {
      generateManagementToken: () => generated.shift() ?? freshToken,
    });
    expect(result).toMatchObject({ ok: true, managementToken: freshToken });
    if (!result.ok) throw new Error("Expected retry to succeed");

    const persisted = await db
      .selectFrom("booking")
      .select([
        "guest_management_token_hash",
        "guest_management_token_encrypted",
      ])
      .where("status", "=", "confirmed")
      .executeTakeFirstOrThrow();

    expect(persisted.guest_management_token_hash).toBe(
      hashGuestManagementToken(freshToken),
    );
    expect(
      decryptGuestManagementToken(
        persisted.guest_management_token_encrypted ?? "",
        config.GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY,
      ),
    ).toBe(freshToken);

    expect(
      await db
        .selectFrom("outbox_event")
        .select("id")
        .where("event_type", "=", "booking.created")
        .execute(),
    ).toHaveLength(1);

    await expect(
      createPublicBooking({ ...input, startMinute: 570 }, now, {
        generateManagementToken: () => collidingToken,
      }),
    ).rejects.toThrow("Could not allocate a unique guest management token");
    expect(publicBookingTestInternals.maxGuestManagementTokenAttempts).toBe(5);
  });

  it("requires nonblank guest name and phone and rejects unknown properties", async () => {
    const f = await fixture();
    await configure(f);
    for (const guestName of ["", "   "]) {
      const response = await f.request({ guestName });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "INVALID_GUEST_NAME" });
    }
    const omitted = await app.inject({
      method: "POST",
      url: `/api/public/organizations/${f.organization.slug}/bookings`,
      payload: {
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 540,
        guestName: "Guest",
      },
    });
    expect(omitted.statusCode).toBe(400);
    for (const guestPhone of ["", "   "]) {
      const response = await f.request({ guestPhone });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "INVALID_GUEST_PHONE" });
    }
    expect((await f.request({ unexpected: true })).statusCode).toBe(400);
  });

  it("stores absent and whitespace-only email as null", async () => {
    const absent = await fixture();
    await configure(absent);
    expect((await absent.request()).statusCode).toBe(201);
    expect(
      await db
        .selectFrom("booking")
        .select("guest_email")
        .executeTakeFirstOrThrow(),
    ).toEqual({ guest_email: null });
  });

  it.each(["0501234567", "+972501234567", "972501234567", "00972501234567"])(
    "persists Israeli phone form %s as canonical E.164",
    async (guestPhone) => {
      const f = await fixture();
      await configure(f);
      expect((await f.request({ guestPhone })).statusCode).toBe(201);
      expect(
        await db
          .selectFrom("booking")
          .select("guest_phone")
          .executeTakeFirstOrThrow(),
      ).toEqual({ guest_phone: "+972501234567" });
    },
  );

  it.each(["invalid", "05012", "0891234567", "+12025550123"])(
    "rejects invalid or foreign phone %s without writing",
    async (guestPhone) => {
      const f = await fixture();
      await configure(f);
      const response = await f.request({ guestPhone });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "INVALID_GUEST_PHONE" });
      expect(await db.selectFrom("booking").select("id").execute()).toEqual([]);
    },
  );

  it("uses one generic 404 for every hidden Organization lifecycle state", async () => {
    for (const options of [
      { publishedAt: null },
      { publishedAt: null, archivedAt: new Date() },
      { suspendedAt: new Date() },
      { publicBookingPaused: true },
    ]) {
      const f = await fixture(options);
      await configure(f);
      expectNotFound(await f.request());
    }
  });

  it("uses the same generic 404 for inactive, cross-tenant, and unassigned pairings", async () => {
    for (const options of [
      { resourceDeactivatedAt: new Date() },
      { serviceDeactivatedAt: new Date() },
    ]) {
      const f = await fixture(options);
      await configure(f);
      expectNotFound(await f.request());
    }
    const unassigned = await fixture();
    await configure(unassigned, { assign: false });
    expectNotFound(await unassigned.request());

    const first = await fixture();
    const second = await fixture();
    await configure(first);
    expectNotFound(
      await first.request({
        resourceId: second.resource.id,
        serviceId: second.service.id,
      }),
    );
  });

  it("distinguishes invalid and out-of-window dates", async () => {
    const f = await fixture();
    await configure(f);
    const invalid = await f.request({ date: "2026-02-30" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "INVALID_DATE" });
    for (const outside of ["2026-10-04", "2026-12-05"]) {
      const response = await f.request({ date: outside });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "DATE_OUTSIDE_BOOKING_WINDOW",
      });
    }
  });

  it("normalizes notice, schedule, Time Block, and confirmed occupancy failures to slot unavailable", async () => {
    const notice = await fixture({ minBookingNoticeMinutes: 90 });
    await configure(notice);
    const outside = await fixture();
    await configure(outside, { startMinute: 600 });
    const blocked = await fixture();
    await configure(blocked);
    await db
      .insertInto("resource_time_block")
      .values({
        organization_id: blocked.organization.id,
        resource_id: blocked.resource.id,
        local_date: date,
        start_minute: 540,
        end_minute: 570,
      })
      .execute();
    const occupied = await fixture();
    await configure(occupied);
    await addBooking(occupied, "confirmed");

    for (const f of [notice, outside, blocked, occupied]) {
      const response = await f.request();
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "SLOT_UNAVAILABLE" });
    }
  });

  it("ignores cancelled and no_show occupancy but treats another Service on the Resource as capacity", async () => {
    for (const status of ["cancelled", "no_show"] as const) {
      const f = await fixture();
      await configure(f);
      await addBooking(f, status);
      expect((await f.request()).statusCode).toBe(201);
    }

    const f = await fixture();
    await configure(f);
    const otherService = await createTestService({
      organizationId: f.organization.id,
    });
    await addBooking(f, "confirmed", { serviceId: otherService.id });
    expect((await f.request()).statusCode).toBe(409);
  });

  it("does not let a Booking on another Resource block the requested Resource", async () => {
    const f = await fixture();
    await configure(f);
    const otherResource = await createTestResource({
      organizationId: f.organization.id,
    });
    await addBooking(f, "confirmed", { resourceId: otherResource.id });
    expect((await f.request()).statusCode).toBe(201);
  });

  it("respects interval 17, Resource date overrides, and duration/buffer fit", async () => {
    const interval = await fixture({
      slotIntervalMinutes: 17,
      durationMinutes: 15,
    });
    await configure(interval, { startMinute: 550, endMinute: 650 });
    expect((await interval.request({ startMinute: 567 })).statusCode).toBe(201);

    const override = await fixture();
    await db
      .insertInto("resource_service")
      .values({
        organization_id: override.organization.id,
        resource_id: override.resource.id,
        service_id: override.service.id,
      })
      .execute();
    const parent = {
      organization_id: override.organization.id,
      resource_id: override.resource.id,
      local_date: date,
    };
    await db.insertInto("resource_date_override").values(parent).execute();
    await db
      .insertInto("resource_date_override_interval")
      .values({ ...parent, start_minute: 540, end_minute: 600 })
      .execute();
    expect((await override.request()).statusCode).toBe(201);

    const fit = await fixture({ durationMinutes: 45, bufferAfterMinutes: 15 });
    await configure(fit, { startMinute: 540, endMinute: 590 });
    expect((await fit.request()).statusCode).toBe(409);
  });

  it.each([
    [false, null, null],
    [true, 5000, 5000],
    [true, 0, 0],
  ] as const)(
    "snapshots pricing enabled=%s price=%s as %s",
    async (pricingEnabled, priceAgorot, expected) => {
      const f = await fixture({ pricingEnabled, priceAgorot });
      await configure(f);
      const response = await f.request();
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ priceAgorot: expected });
      expect(
        await db
          .selectFrom("booking")
          .select("price_agorot")
          .executeTakeFirstOrThrow(),
      ).toEqual({ price_agorot: expected });
    },
  );

  it("preserves duration, buffer, occupancy, and price snapshots after Service edits", async () => {
    const f = await fixture({
      pricingEnabled: true,
      priceAgorot: 5000,
      durationMinutes: 45,
      bufferAfterMinutes: 15,
    });
    await configure(f);
    expect((await f.request()).statusCode).toBe(201);
    await db
      .updateTable("service")
      .set({
        duration_minutes: 30,
        buffer_after_minutes: 0,
        price_agorot: 6000,
      })
      .where("id", "=", f.service.id)
      .execute();
    expect(
      await db
        .selectFrom("booking")
        .select([
          "duration_minutes",
          "buffer_after_minutes",
          "service_end_at",
          "occupied_until_at",
          "price_agorot",
        ])
        .executeTakeFirstOrThrow(),
    ).toEqual({
      duration_minutes: 45,
      buffer_after_minutes: 15,
      service_end_at: new Date("2026-10-05T06:45:00.000Z"),
      occupied_until_at: new Date("2026-10-05T07:00:00.000Z"),
      price_agorot: 5000,
    });
  });

  it("allows exactly one of two concurrent public requests for the same slot", async () => {
    const f = await fixture();
    await configure(f);
    const responses = await Promise.all([f.request(), f.request()]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(
      responses.find((response) => response.statusCode === 409)?.json(),
    ).toMatchObject({ code: "SLOT_UNAVAILABLE" });
    const bookings = await db
      .selectFrom("booking")
      .select("id")
      .where("resource_id", "=", f.resource.id)
      .where("status", "=", "confirmed")
      .execute();
    expect(bookings).toHaveLength(1);
    expect(
      await db
        .selectFrom("outbox_event")
        .select(["aggregate_id", "event_type", "published_at"])
        .where("event_type", "=", "booking.created")
        .execute(),
    ).toEqual([
      {
        aggregate_id: bookings[0]?.id,
        event_type: "booking.created",
        published_at: null,
      },
    ]);
  });

  it("keeps authenticated management routes protected", async () => {
    const f = await fixture();
    const response = await app.inject({
      method: "GET",
      url: `/api/organizations/${f.organization.id}/availability/settings`,
    });
    expect(response.statusCode).toBe(401);
  });
});
