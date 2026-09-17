import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import type { MembershipRole } from "../../src/db-types.js";
import type { MinuteInterval } from "../../src/modules/availability/minute-interval.js";
import {
  resolveResourceServiceSlotContextAfterAccessInTransaction,
  resolveResourceServiceSlotStartsForDate,
} from "../../src/modules/availability/resource-service-slot-resolver.js";
import {
  addTestMembership,
  createTestOrganization,
  createTestResource,
  createTestService,
  createTestUser,
} from "../helpers/factories.js";

const date = "2026-10-05";
const interval = (startMinute: number, endMinute: number): MinuteInterval => ({
  startMinute,
  endMinute,
});

type FixtureOptions = {
  role?: MembershipRole;
  linkResourceToActor?: boolean;
  slotIntervalMinutes?: number;
  durationMinutes?: number;
  bufferAfterMinutes?: number;
};

async function fixture({
  role = "owner",
  linkResourceToActor = false,
  slotIntervalMinutes = 15,
  durationMinutes = 30,
  bufferAfterMinutes = 0,
}: FixtureOptions = {}) {
  const actor = await createTestUser();
  const organization = await createTestOrganization();
  await addTestMembership({
    organizationId: organization.id,
    userId: actor.id,
    role,
  });
  if (slotIntervalMinutes !== 15)
    await db
      .updateTable("organization")
      .set({ slot_interval_minutes: slotIntervalMinutes })
      .where("id", "=", organization.id)
      .execute();
  const resource = await createTestResource({
    organizationId: organization.id,
    userId: linkResourceToActor ? actor.id : null,
  });
  const service = await createTestService({
    organizationId: organization.id,
    durationMinutes,
    bufferAfterMinutes,
  });
  const input = {
    userId: actor.id,
    organizationId: organization.id,
    resourceId: resource.id,
    serviceId: service.id,
    date,
  };
  return {
    actor,
    organization,
    resource,
    service,
    input,
    resolve: (changes: Partial<typeof input> = {}) =>
      resolveResourceServiceSlotStartsForDate({ ...input, ...changes }),
    success: (starts: number[]) => ({
      ok: true,
      slots: {
        timezone: "Asia/Jerusalem",
        resourceId: resource.id,
        serviceId: service.id,
        date,
        starts,
      },
    }),
  };
}

type TestFixture = Awaited<ReturnType<typeof fixture>>;

async function setOrganizationWeeklyHours(
  f: TestFixture,
  intervals: readonly MinuteInterval[],
) {
  if (intervals.length === 0) return;
  await db
    .insertInto("organization_weekly_hours")
    .values(
      intervals.map((value) => ({
        organization_id: f.organization.id,
        weekday: 1,
        start_minute: value.startMinute,
        end_minute: value.endMinute,
      })),
    )
    .execute();
}

async function assignService(f: TestFixture) {
  await db
    .insertInto("resource_service")
    .values({
      organization_id: f.organization.id,
      resource_id: f.resource.id,
      service_id: f.service.id,
    })
    .execute();
}

async function setResourceWeeklyHours(
  f: TestFixture,
  intervals: readonly MinuteInterval[],
) {
  const parent = {
    organization_id: f.organization.id,
    resource_id: f.resource.id,
    weekday: 1,
  };
  await db
    .insertInto("resource_weekly_hours_override")
    .values(parent)
    .execute();
  if (intervals.length > 0)
    await db
      .insertInto("resource_weekly_hours_interval")
      .values(
        intervals.map((value) => ({
          ...parent,
          start_minute: value.startMinute,
          end_minute: value.endMinute,
        })),
      )
      .execute();
}

async function setOrganizationDateHours(
  f: TestFixture,
  intervals: readonly MinuteInterval[],
) {
  const parent = {
    organization_id: f.organization.id,
    local_date: date,
  };
  await db.insertInto("organization_date_override").values(parent).execute();
  if (intervals.length > 0)
    await db
      .insertInto("organization_date_override_interval")
      .values(
        intervals.map((value) => ({
          ...parent,
          start_minute: value.startMinute,
          end_minute: value.endMinute,
        })),
      )
      .execute();
}

async function setResourceDateHours(
  f: TestFixture,
  intervals: readonly MinuteInterval[],
) {
  const parent = {
    organization_id: f.organization.id,
    resource_id: f.resource.id,
    local_date: date,
  };
  await db.insertInto("resource_date_override").values(parent).execute();
  if (intervals.length > 0)
    await db
      .insertInto("resource_date_override_interval")
      .values(
        intervals.map((value) => ({
          ...parent,
          start_minute: value.startMinute,
          end_minute: value.endMinute,
        })),
      )
      .execute();
}

async function addTimeBlock(
  f: TestFixture,
  startMinute: number,
  endMinute: number,
) {
  await db
    .insertInto("resource_time_block")
    .values({
      organization_id: f.organization.id,
      resource_id: f.resource.id,
      local_date: date,
      start_minute: startMinute,
      end_minute: endMinute,
    })
    .execute();
}

describe("Resource-Service slot resolver", () => {
  it("exposes preauthorized snapshot inputs without changing configured slots", async () => {
    const f = await fixture({
      slotIntervalMinutes: 17,
      durationMinutes: 45,
      bufferAfterMinutes: 15,
    });
    await db
      .updateTable("organization")
      .set({ pricing_enabled: true })
      .where("id", "=", f.organization.id)
      .execute();
    await db
      .updateTable("service")
      .set({ price_agorot: 5000 })
      .where("id", "=", f.service.id)
      .execute();
    await setOrganizationWeeklyHours(f, [interval(540, 720)]);
    await assignService(f);

    const context = await db.transaction().execute((trx) =>
      resolveResourceServiceSlotContextAfterAccessInTransaction(trx, {
        organizationId: f.organization.id,
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
      }),
    );
    expect(context).toEqual({
      ok: true,
      context: {
        timezone: "Asia/Jerusalem",
        resourceId: f.resource.id,
        serviceId: f.service.id,
        date,
        starts: [540, 557, 574, 591, 608, 625, 642, 659],
        slotIntervalMinutes: 17,
        durationMinutes: 45,
        bufferAfterMinutes: 15,
        priceAgorot: 5000,
        pricingEnabled: true,
        serviceDeactivatedAt: null,
      },
    });
    expect(await f.resolve()).toEqual(
      f.success([540, 557, 574, 591, 608, 625, 642, 659]),
    );
  });

  it("resolves the full configured pipeline with Service duration and buffer", async () => {
    const f = await fixture({ durationMinutes: 45, bufferAfterMinutes: 15 });
    await setOrganizationWeeklyHours(f, [interval(540, 720)]);
    await assignService(f);
    expect(await f.resolve()).toEqual(
      f.success([540, 555, 570, 585, 600, 615, 630, 645, 660]),
    );
  });

  it("reads an arbitrary Organization interval and anchors it to the window", async () => {
    const f = await fixture({ slotIntervalMinutes: 17, durationMinutes: 15 });
    await setOrganizationWeeklyHours(f, [interval(550, 650)]);
    await assignService(f);
    expect(await f.resolve()).toEqual(
      f.success([550, 567, 584, 601, 618, 635]),
    );
  });

  it("uses a Resource weekly override instead of Organization weekly hours", async () => {
    const f = await fixture();
    await setOrganizationWeeklyHours(f, [interval(540, 600)]);
    await setResourceWeeklyHours(f, [interval(660, 720)]);
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([660, 675, 690]));
  });

  it("treats an Organization date closure as terminal", async () => {
    const f = await fixture();
    await setOrganizationWeeklyHours(f, [interval(540, 600)]);
    await setOrganizationDateHours(f, []);
    await setResourceDateHours(f, [interval(660, 720)]);
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([]));
  });

  it("uses custom Organization date hours", async () => {
    const f = await fixture();
    await setOrganizationWeeklyHours(f, [interval(540, 600)]);
    await setOrganizationDateHours(f, [interval(600, 660)]);
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([600, 615, 630]));
  });

  it("uses custom Resource date hours", async () => {
    const f = await fixture();
    await setOrganizationWeeklyHours(f, [interval(540, 600)]);
    await setResourceDateHours(f, [interval(700, 760)]);
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([700, 715, 730]));
  });

  it("lets a Resource date override open an otherwise empty recurring day", async () => {
    const f = await fixture();
    await setResourceDateHours(f, [interval(700, 760)]);
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([700, 715, 730]));
  });

  it("subtracts Time Blocks before fitting the Service", async () => {
    const f = await fixture({ durationMinutes: 30 });
    await setOrganizationWeeklyHours(f, [interval(540, 720)]);
    await addTimeBlock(f, 600, 630);
    await assignService(f);
    expect(await f.resolve()).toEqual(
      f.success([540, 555, 570, 630, 645, 660, 675, 690]),
    );
  });

  it("fits buffer time against windows split by a Time Block", async () => {
    const f = await fixture({ durationMinutes: 45, bufferAfterMinutes: 15 });
    await setOrganizationWeeklyHours(f, [interval(540, 720)]);
    await addTimeBlock(f, 600, 630);
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([540, 630, 645, 660]));
  });

  it("does not combine adjacent working windows for Service fitting", async () => {
    const f = await fixture({ durationMinutes: 90 });
    await setOrganizationWeeklyHours(f, [
      interval(540, 600),
      interval(600, 660),
    ]);
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([]));
  });

  it("distinguishes a missing assignment from empty Availability", async () => {
    const f = await fixture();
    await setOrganizationWeeklyHours(f, [interval(540, 600)]);
    expect(await f.resolve()).toEqual({
      ok: false,
      reason: "service_not_assigned",
    });
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([540, 555, 570]));
  });

  it("hides Services from other Organizations", async () => {
    const f = await fixture();
    const other = await fixture();
    expect(await f.resolve({ serviceId: other.service.id })).toEqual({
      ok: false,
      reason: "service_not_found",
    });
  });

  it("preserves Resource anti-leak precedence before Service lookup", async () => {
    const f = await fixture();
    const other = await fixture();
    expect(await f.resolve({ resourceId: other.resource.id })).toEqual({
      ok: false,
      reason: "resource_not_found",
    });
  });

  it.each(["owner", "manager"] as const)(
    "allows an %s to resolve an unlinked Resource",
    async (role) => {
      const f = await fixture({ role });
      await setOrganizationWeeklyHours(f, [interval(540, 600)]);
      await assignService(f);
      expect(await f.resolve()).toEqual(f.success([540, 555, 570]));
    },
  );

  it("allows Staff to resolve their own linked Resource", async () => {
    const f = await fixture({ role: "staff", linkResourceToActor: true });
    await setOrganizationWeeklyHours(f, [interval(540, 600)]);
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([540, 555, 570]));
  });

  it("denies Staff access to an unrelated Resource", async () => {
    const f = await fixture({ role: "staff" });
    expect(await f.resolve()).toEqual({
      ok: false,
      reason: "insufficient_role",
    });
  });

  it("hides the Organization from a non-member", async () => {
    const f = await fixture();
    expect(await f.resolve({ userId: randomUUID() })).toEqual({
      ok: false,
      reason: "organization_not_found",
    });
  });

  it("rejects an invalid local calendar date", async () => {
    const f = await fixture();
    expect(await f.resolve({ date: "2026-02-30" })).toEqual({
      ok: false,
      reason: "invalid_date",
    });
  });

  it("returns success with no starts for an empty valid day", async () => {
    const f = await fixture();
    await assignService(f);
    expect(await f.resolve()).toEqual(f.success([]));
  });

  it("keeps deactivated Resources and Services visible to the internal resolver", async () => {
    const f = await fixture();
    await setOrganizationWeeklyHours(f, [interval(540, 600)]);
    await assignService(f);
    await db
      .updateTable("resource")
      .set({ deactivated_at: new Date() })
      .where("id", "=", f.resource.id)
      .execute();
    await db
      .updateTable("service")
      .set({ deactivated_at: new Date() })
      .where("id", "=", f.service.id)
      .execute();
    expect(await f.resolve()).toEqual(f.success([540, 555, 570]));
  });

  it.each(["archived_at", "suspended_at"] as const)(
    "does not apply Organization %s public policy",
    async (state) => {
      const f = await fixture();
      await setOrganizationWeeklyHours(f, [interval(540, 600)]);
      await assignService(f);
      await db
        .updateTable("organization")
        .set({ [state]: new Date() })
        .where("id", "=", f.organization.id)
        .execute();
      expect(await f.resolve()).toEqual(f.success([540, 555, 570]));
    },
  );
});
