import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import { createManualBooking } from "../../../src/modules/bookings/application/create-manual-booking.js";
import { createPublicBooking } from "../../../src/modules/bookings/application/create-public-booking.js";
import {
  cancelGuestManagedBooking,
  updateGuestManagedBookingContact,
} from "../../../src/modules/bookings/application/guest/write.js";
import {
  cancelManagementBooking,
  markManagementBookingNoShow,
} from "../../../src/modules/bookings/application/lifecycle.js";
import { rescheduleManagementBooking } from "../../../src/modules/bookings/application/reschedule.js";
import {
  addTestMembership,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../../helpers/factories.js";

const date = "2026-10-05";
const startAt = new Date("2026-10-05T06:00:00.000Z");

async function fixture() {
  const actor = await createTestUser();
  const organization = await createTestOrganization({
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    minBookingNoticeMinutes: 0,
    maxBookingHorizonDays: 60,
  });
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role: "owner",
  });
  const resource = await createTestResource({
    organizationId: organization.id,
  });
  const service = await createTestService({
    organizationId: organization.id,
  });
  await db
    .insertInto("organization_weekly_hours")
    .values({
      organization_id: organization.id,
      weekday: 1,
      start_minute: 540,
      end_minute: 600,
    })
    .execute();
  await db
    .insertInto("resource_service")
    .values({
      organization_id: organization.id,
      resource_id: resource.id,
      service_id: service.id,
    })
    .execute();
  return { actor, organization, resource, service };
}

async function reminderRows() {
  return db
    .selectFrom("booking_reminder")
    .selectAll()
    .orderBy("created_at")
    .execute();
}

describe("Booking reminder scheduling", () => {
  it.each([
    {
      label: "more than 24 hours",
      now: "2026-10-04T05:59:59.999Z",
      expectedCount: 1,
    },
    {
      label: "exactly 24 hours",
      now: "2026-10-04T06:00:00.000Z",
      expectedCount: 0,
    },
    {
      label: "less than 24 hours",
      now: "2026-10-04T06:00:00.001Z",
      expectedCount: 0,
    },
  ])(
    "applies the strict boundary to Public Bookings: $label",
    async ({ now, expectedCount }) => {
      const f = await fixture();
      const result = await createPublicBooking(
        {
          organizationSlug: f.organization.slug,
          resourceId: f.resource.id,
          serviceId: f.service.id,
          date,
          startMinute: 540,
          guestName: "Guest",
          guestPhone: "0501234567",
          guestEmail: "guest@example.test",
        },
        new Date(now),
      );
      expect(result.ok).toBe(true);
      const reminders = await reminderRows();
      expect(reminders).toHaveLength(expectedCount);
      if (expectedCount === 1) {
        expect(reminders[0]?.status).toBe("pending");
        expect(reminders[0]?.scheduled_for_start_at).toEqual(startAt);
        expect(reminders[0]?.due_at).toEqual(
          new Date("2026-10-04T06:00:00.000Z"),
        );
      }
    },
  );

  it("creates no reminder for a Public Booking without email", async () => {
    const f = await fixture();
    const result = await createPublicBooking(
      {
        organizationSlug: f.organization.slug,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 540,
        guestName: "Guest",
        guestPhone: "0501234567",
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    expect(result.ok).toBe(true);
    expect(await reminderRows()).toHaveLength(0);
  });

  it.each([
    ["2026-10-04T05:59:59.999Z", "manual@example.test", 1],
    ["2026-10-04T06:00:00.000Z", "manual@example.test", 0],
    ["2026-10-04T06:00:00.001Z", "manual@example.test", 0],
    ["2026-10-01T00:00:00.000Z", null, 0],
  ] as const)(
    "schedules Manual Bookings consistently (now=%s, email=%s)",
    async (now, guestEmail, expectedCount) => {
      const f = await fixture();
      const result = await createManualBooking(
        {
          userId: f.actor.id,
          organizationId: f.organization.id,
          resourceId: f.resource.id,
          serviceId: f.service.id,
          date,
          startMinute: 540,
          guestName: "Manual guest",
          guestEmail,
        },
        new Date(now),
      );
      expect(result.ok).toBe(true);
      expect(await reminderRows()).toHaveLength(expectedCount);
    },
  );

  it("adds, preserves, and cancels the pending reminder as guest email changes", async () => {
    const f = await fixture();
    const created = await createPublicBooking(
      {
        organizationSlug: f.organization.slug,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 540,
        guestName: "Guest",
        guestPhone: "0501234567",
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    if (!created.ok) throw new Error("Expected Booking creation to succeed");

    await updateGuestManagedBookingContact(
      { token: created.managementToken, guestEmail: "first@example.test" },
      new Date("2026-10-01T00:01:00.000Z"),
    );
    const first = await reminderRows();
    expect(first).toHaveLength(1);
    expect(first[0]?.status).toBe("pending");

    await updateGuestManagedBookingContact(
      { token: created.managementToken, guestEmail: "second@example.test" },
      new Date("2026-10-01T00:02:00.000Z"),
    );
    expect(await reminderRows()).toEqual(first);

    await updateGuestManagedBookingContact(
      { token: created.managementToken, guestEmail: null },
      new Date("2026-10-01T00:03:00.000Z"),
    );
    const cancelled = await reminderRows();
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toMatchObject({ status: "cancelled" });
    expect(cancelled[0]?.cancelled_at).toEqual(
      new Date("2026-10-01T00:03:00.000Z"),
    );
  });

  it("does not recreate a dispatched reminder for the same appointment after an email edit", async () => {
    const f = await fixture();
    const created = await createPublicBooking(
      {
        organizationSlug: f.organization.slug,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 540,
        guestName: "Guest",
        guestPhone: "0501234567",
        guestEmail: "first@example.test",
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    if (!created.ok) throw new Error("Expected Booking creation to succeed");
    await db
      .updateTable("booking_reminder")
      .set({
        status: "dispatched",
        dispatched_at: new Date("2026-10-04T06:00:00.000Z"),
      })
      .execute();

    await updateGuestManagedBookingContact(
      { token: created.managementToken, guestEmail: "second@example.test" },
      new Date("2026-10-01T00:01:00.000Z"),
    );
    expect(await reminderRows()).toHaveLength(1);
    expect((await reminderRows())[0]?.status).toBe("dispatched");
  });

  it("cancels the old pending reminder and creates a fresh one on reschedule", async () => {
    const f = await fixture();
    const created = await createManualBooking(
      {
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 540,
        guestEmail: "guest@example.test",
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    if (!created.ok) throw new Error("Expected Booking creation to succeed");
    const result = await rescheduleManagementBooking(
      {
        userId: f.actor.id,
        organizationId: f.organization.id,
        bookingId: created.booking.id,
        resourceId: f.resource.id,
        date: "2026-10-12",
        startMinute: 540,
      },
      new Date("2026-10-01T01:00:00.000Z"),
    );
    expect(result.ok).toBe(true);
    const reminders = await reminderRows();
    expect(reminders.map((reminder) => reminder.status).sort()).toEqual([
      "cancelled",
      "pending",
    ]);
    expect(
      reminders.find((reminder) => reminder.status === "pending")
        ?.scheduled_for_start_at,
    ).toEqual(new Date("2026-10-12T06:00:00.000Z"));
  });

  it("retains dispatched history and schedules a new reminder after a genuine reschedule", async () => {
    const f = await fixture();
    const created = await createManualBooking(
      {
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 540,
        guestEmail: "guest@example.test",
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    if (!created.ok) throw new Error("Expected Booking creation to succeed");
    await db
      .updateTable("booking_reminder")
      .set({
        status: "dispatched",
        dispatched_at: new Date("2026-10-04T06:00:00.000Z"),
      })
      .execute();

    expect(
      (
        await rescheduleManagementBooking(
          {
            userId: f.actor.id,
            organizationId: f.organization.id,
            bookingId: created.booking.id,
            resourceId: f.resource.id,
            date: "2026-10-12",
            startMinute: 540,
          },
          new Date("2026-10-04T07:00:00.000Z"),
        )
      ).ok,
    ).toBe(true);
    const reminders = await reminderRows();
    expect(reminders).toHaveLength(2);
    expect(reminders.map((reminder) => reminder.status).sort()).toEqual([
      "dispatched",
      "pending",
    ]);
  });

  it("does not schedule a replacement when rescheduled inside 24 hours", async () => {
    const f = await fixture();
    const created = await createManualBooking(
      {
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 540,
        guestEmail: "guest@example.test",
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    if (!created.ok) throw new Error("Expected Booking creation to succeed");
    expect(
      (
        await rescheduleManagementBooking(
          {
            userId: f.actor.id,
            organizationId: f.organization.id,
            bookingId: created.booking.id,
            resourceId: f.resource.id,
            date,
            startMinute: 570,
          },
          new Date("2026-10-04T07:00:00.000Z"),
        )
      ).ok,
    ).toBe(true);
    expect(await reminderRows()).toMatchObject([{ status: "cancelled" }]);
  });

  it("cancels pending reminders for management and guest cancellation", async () => {
    const f = await fixture();
    const management = await createManualBooking(
      {
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 540,
        guestEmail: "management@example.test",
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    if (!management.ok) throw new Error("Expected Booking creation to succeed");
    await cancelManagementBooking(
      {
        userId: f.actor.id,
        organizationId: f.organization.id,
        bookingId: management.booking.id,
      },
      new Date("2026-10-01T01:00:00.000Z"),
    );
    expect(await reminderRows()).toMatchObject([{ status: "cancelled" }]);

    const guest = await createPublicBooking(
      {
        organizationSlug: f.organization.slug,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 570,
        guestName: "Guest",
        guestPhone: "0501234567",
        guestEmail: "guest@example.test",
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    if (!guest.ok) throw new Error("Expected Booking creation to succeed");
    await cancelGuestManagedBooking(
      { token: guest.managementToken },
      new Date("2026-10-01T01:00:00.000Z"),
    );
    expect((await reminderRows()).map((reminder) => reminder.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
  });

  it("leaves no pending reminder after a no-show transition", async () => {
    const f = await fixture();
    const created = await createManualBooking(
      {
        userId: f.actor.id,
        organizationId: f.organization.id,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        startMinute: 540,
        guestEmail: "guest@example.test",
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    if (!created.ok) throw new Error("Expected Booking creation to succeed");
    await markManagementBookingNoShow(
      {
        userId: f.actor.id,
        organizationId: f.organization.id,
        bookingId: created.booking.id,
      },
      startAt,
    );
    expect(await reminderRows()).toMatchObject([{ status: "cancelled" }]);
  });
});
