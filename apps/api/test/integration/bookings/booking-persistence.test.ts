import { randomUUID } from "node:crypto";
import { type Insertable, type Kysely, sql } from "kysely";
import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import type { BookingStatus, BookingTable } from "../../../src/db-types.js";
import { down, up } from "../../../src/migrations/0017_create_booking.js";
import {
  down as downGuestManagement,
  up as upGuestManagement,
} from "../../../src/migrations/0019_add_guest_booking_management.js";
import { up as upEncryptedGuestManagementToken } from "../../../src/migrations/0021_add_encrypted_guest_management_token.js";
import {
  down as downManualBookingMetadata,
  up as upManualBookingMetadata,
} from "../../../src/migrations/0025_add_manual_booking_metadata.js";
import {
  createTestBooking,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

const startAt = new Date("2026-10-05T06:00:00.000Z");
const serviceEndAt = new Date("2026-10-05T06:30:00.000Z");
const occupiedUntilAt = new Date("2026-10-05T06:45:00.000Z");

async function fixture() {
  const organization = await createTestOrganization();
  const resource = await createTestResource({
    organizationId: organization.id,
  });
  const service = await createTestService({
    organizationId: organization.id,
    durationMinutes: 30,
    bufferAfterMinutes: 15,
  });
  return { organization, resource, service };
}

async function insertBooking(
  overrides: Partial<Insertable<BookingTable>> = {},
) {
  const { organization, resource, service } = await fixture();
  return db
    .insertInto("booking")
    .values({
      organization_id: organization.id,
      resource_id: resource.id,
      service_id: service.id,
      public_reference: randomUUID(),
      source: "public",
      start_at: startAt,
      service_end_at: serviceEndAt,
      occupied_until_at: occupiedUntilAt,
      duration_minutes: 30,
      buffer_after_minutes: 15,
      price_agorot: null,
      guest_name: "Guest",
      guest_phone: null,
      guest_email: null,
      customer_note: null,
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
      cancellation_cutoff_minutes: 0,
      guest_management_token_hash: null,
      guest_management_token_encrypted:
        overrides.guest_management_token_hash == null
          ? null
          : "test-encrypted-token",
      ...overrides,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

describe("Booking persistence", () => {
  it("accepts nullable names while rejecting blank non-null names and invalid sources", async () => {
    await expect(insertBooking({ guest_name: null })).resolves.toMatchObject({
      guest_name: null,
      source: "public",
    });
    await expect(insertBooking({ guest_name: "   " })).rejects.toMatchObject({
      constraint: "booking_guest_name_check",
    });
    await expect(
      insertBooking({ source: "invalid" as "public" }),
    ).rejects.toMatchObject({ constraint: "booking_source_check" });
  });

  it("preserves Booking history when its attributed creator is deleted", async () => {
    const creator = await createTestUser();
    const row = await insertBooking({
      source: "manual",
      created_by_user_id: creator.id,
    });
    await db.deleteFrom("user").where("id", "=", creator.id).execute();
    expect(
      await db
        .selectFrom("booking")
        .select(["source", "created_by_user_id"])
        .where("id", "=", row.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ source: "manual", created_by_user_id: null });
  });

  it("backfills historical Bookings as public without creator attribution", async () => {
    const f = await fixture();
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await downManualBookingMetadata(migrationDb);
      const id = randomUUID();
      await sql`
        INSERT INTO booking (
          id, organization_id, resource_id, service_id, public_reference,
          status, start_at, service_end_at, occupied_until_at,
          duration_minutes, buffer_after_minutes, guest_name
        ) VALUES (
          ${id}, ${f.organization.id}, ${f.resource.id}, ${f.service.id},
          ${randomUUID()}, 'confirmed', ${startAt}, ${serviceEndAt},
          ${occupiedUntilAt}, 30, 15, 'Historical guest'
        )
      `.execute(trx);
      await upManualBookingMetadata(migrationDb);
      expect(
        await trx
          .selectFrom("booking")
          .select(["source", "created_by_user_id"])
          .where("id", "=", id)
          .executeTakeFirstOrThrow(),
      ).toEqual({ source: "public", created_by_user_id: null });
    });
  });

  it("inserts a confirmed Booking with temporal and guest snapshots", async () => {
    const row = await insertBooking({
      guest_phone: "+972501234567",
      guest_email: "guest@example.test",
      customer_note: "Window seat",
    });

    expect(row).toMatchObject({
      status: "confirmed",
      start_at: startAt,
      service_end_at: serviceEndAt,
      occupied_until_at: occupiedUntilAt,
      duration_minutes: 30,
      buffer_after_minutes: 15,
      guest_name: "Guest",
      guest_phone: "+972501234567",
      guest_email: "guest@example.test",
      customer_note: "Window seat",
    });
    expect(row.id).toEqual(expect.any(String));
  });

  it("enforces globally unique public references", async () => {
    const first = await fixture();
    const second = await fixture();
    const publicReference = "BOOK-UNIQUE";
    await createTestBooking({
      organizationId: first.organization.id,
      resourceId: first.resource.id,
      serviceId: first.service.id,
      publicReference,
      startAt,
      durationMinutes: 30,
      bufferAfterMinutes: 15,
    });
    await expect(
      createTestBooking({
        organizationId: second.organization.id,
        resourceId: second.resource.id,
        serviceId: second.service.id,
        publicReference,
        startAt,
        durationMinutes: 30,
        bufferAfterMinutes: 15,
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces nonnegative cancellation snapshots and unique nullable token hashes", async () => {
    await expect(
      insertBooking({ cancellation_cutoff_minutes: -1 }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "booking_cancellation_cutoff_minutes_check",
    });
    await insertBooking({ guest_management_token_hash: null });
    await insertBooking({ guest_management_token_hash: null });
    await insertBooking({ guest_management_token_hash: "unique-hash" });
    await expect(
      insertBooking({ guest_management_token_hash: "unique-hash" }),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "booking_guest_management_token_hash_key",
    });
  });

  it("requires new management-token hashes and encrypted copies as a pair", async () => {
    await expect(
      insertBooking({
        guest_management_token_hash: "hash-only",
        guest_management_token_encrypted: null,
      }),
    ).rejects.toMatchObject({
      constraint: "booking_guest_management_token_pair_check",
    });
    await expect(
      insertBooking({
        guest_management_token_hash: null,
        guest_management_token_encrypted: "encrypted-only",
      }),
    ).rejects.toMatchObject({
      constraint: "booking_guest_management_token_pair_check",
    });
  });

  it.each([
    ["zero duration", { duration_minutes: 0 }],
    ["negative buffer", { buffer_after_minutes: -1 }],
    ["negative price", { price_agorot: -1 }],
    ["empty guest name", { guest_name: "" }],
    ["whitespace guest name", { guest_name: "  " }],
    ["invalid status", { status: "pending" as BookingStatus }],
    ["equal start and service end", { service_end_at: startAt }],
    [
      "service end after occupied until",
      { occupied_until_at: new Date("2026-10-05T06:29:00.000Z") },
    ],
    [
      "duration snapshot mismatch",
      { service_end_at: new Date("2026-10-05T06:31:00.000Z") },
    ],
    [
      "buffer snapshot mismatch",
      { occupied_until_at: new Date("2026-10-05T06:46:00.000Z") },
    ],
  ])("rejects %s", async (_description, overrides) => {
    await expect(insertBooking(overrides)).rejects.toMatchObject({
      code: "23514",
      table: "booking",
    });
  });

  it.each([null, 0])("accepts the price snapshot %s", async (priceAgorot) => {
    expect(
      (await insertBooking({ price_agorot: priceAgorot })).price_agorot,
    ).toBe(priceAgorot);
  });

  it("accepts a valid cancelled state with an optional authenticated actor", async () => {
    const actor = await createTestUser();
    const cancelledAt = new Date("2026-10-04T18:00:00.000Z");
    const row = await insertBooking({
      status: "cancelled",
      cancelled_at: cancelledAt,
      cancelled_by_user_id: actor.id,
      cancellation_reason: "Plans changed",
    });
    expect(row).toMatchObject({
      status: "cancelled",
      cancelled_at: cancelledAt,
      cancelled_by_user_id: actor.id,
      cancellation_reason: "Plans changed",
    });
  });

  it.each([
    [
      "cancelled without cancelled_at",
      { status: "cancelled" as BookingStatus },
    ],
    [
      "confirmed with cancellation metadata",
      { status: "confirmed" as BookingStatus, cancelled_at: new Date() },
    ],
    [
      "no_show with cancellation metadata",
      { status: "no_show" as BookingStatus, cancellation_reason: "invalid" },
    ],
  ])("rejects %s", async (_description, overrides) => {
    await expect(insertBooking(overrides)).rejects.toMatchObject({
      code: "23514",
      constraint: "booking_cancellation_state_check",
    });
  });

  it("enforces tenant identity for Resource and Service", async () => {
    const first = await fixture();
    const second = await fixture();
    await expect(
      createTestBooking({
        organizationId: first.organization.id,
        resourceId: second.resource.id,
        serviceId: first.service.id,
        publicReference: "BOOK-WRONG-RESOURCE-TENANT",
        startAt,
        durationMinutes: 30,
        bufferAfterMinutes: 15,
      }),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "booking_resource_organization_fk",
    });
    await expect(
      createTestBooking({
        organizationId: first.organization.id,
        resourceId: first.resource.id,
        serviceId: second.service.id,
        publicReference: "BOOK-WRONG-SERVICE-TENANT",
        startAt,
        durationMinutes: 30,
        bufferAfterMinutes: 15,
      }),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "booking_service_organization_fk",
    });
  });

  it("preserves Booking history by restricting parent deletion", async () => {
    const f = await fixture();
    await createTestBooking({
      organizationId: f.organization.id,
      resourceId: f.resource.id,
      serviceId: f.service.id,
      publicReference: "BOOK-HISTORY",
      startAt,
      durationMinutes: 30,
      bufferAfterMinutes: 15,
    });
    for (const [table, id] of [
      ["resource", f.resource.id],
      ["service", f.service.id],
      ["organization", f.organization.id],
    ] as const) {
      await expect(
        db.deleteFrom(table).where("id", "=", id).execute(),
      ).rejects.toMatchObject({ code: "23503" });
    }
    expect(await db.selectFrom("booking").select("id").execute()).toHaveLength(
      1,
    );
  });

  it("sets a deleted cancellation actor to null without deleting history", async () => {
    const actor = await createTestUser();
    const row = await insertBooking({
      status: "cancelled",
      cancelled_at: new Date("2026-10-04T18:00:00.000Z"),
      cancelled_by_user_id: actor.id,
    });
    await db.deleteFrom("user").where("id", "=", actor.id).execute();
    expect(
      await db
        .selectFrom("booking")
        .select("cancelled_by_user_id")
        .where("id", "=", row.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ cancelled_by_user_id: null });
  });

  it("reverses and reapplies migration 0017", async () => {
    await insertBooking();
    await db.transaction().execute(async (trx) => {
      const migrationDb = trx as unknown as Kysely<unknown>;
      await downManualBookingMetadata(migrationDb);
      await downGuestManagement(migrationDb);
      await down(migrationDb);
      const { rows } = await sql<{ table_name: string | null }>`
        SELECT to_regclass('booking')::text AS table_name
      `.execute(trx);
      expect(rows[0]?.table_name).toBeNull();
      await up(migrationDb);
      await upGuestManagement(migrationDb);
      await upEncryptedGuestManagementToken(migrationDb);
      await upManualBookingMetadata(migrationDb);
    });
    expect((await insertBooking()).status).toBe("confirmed");
  });
});
