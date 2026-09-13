import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import type { MembershipRole } from "../../src/db-types.js";
import type {
  AvailabilityLayers,
  ScheduleOverride,
} from "../../src/modules/availability/resource-schedule.js";
import { resolveResourceScheduleForDate } from "../../src/modules/availability/resource-schedule-resolver.js";

const date = "2026-10-05";
const baseline = [{ startMinute: 540, endMinute: 1020 }];
const inherit: ScheduleOverride = { mode: "inherit", intervals: [] };
const closed: ScheduleOverride = { mode: "closed", intervals: [] };
const custom = (startMinute: number, endMinute: number): ScheduleOverride => ({
  mode: "custom",
  intervals: [{ startMinute, endMinute }],
});

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
      slug: `schedule-${randomUUID()}`,
      name: "Schedule organization",
      published_at: null,
      archived_at: null,
      suspended_at: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const organizationId = organization.id;
  await db
    .insertInto("membership")
    .values({ organization_id: organizationId, user_id: userId, role: "owner" })
    .execute();
  const resource = await db
    .insertInto("resource")
    .values({
      organization_id: organizationId,
      user_id: null,
      name: "Resource",
      deactivated_at: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const resourceId = resource.id;
  const input = { userId, organizationId, resourceId, date };
  const resolve = (changes: Partial<typeof input> = {}) =>
    resolveResourceScheduleForDate({ ...input, ...changes });
  const role = (role: MembershipRole) =>
    db
      .updateTable("membership")
      .set({ role })
      .where("organization_id", "=", organizationId)
      .where("user_id", "=", userId)
      .execute();
  const seed = async (changes: Partial<AvailabilityLayers> = {}) => {
    const layers: AvailabilityLayers = {
      organizationWeekly: baseline,
      resourceWeekly: inherit,
      organizationDate: inherit,
      resourceDate: inherit,
      ...changes,
    };
    const weeklyParent = {
      organization_id: organizationId,
      resource_id: resourceId,
      weekday: 1,
    };
    const dateParent = {
      organization_id: organizationId,
      resource_id: resourceId,
      local_date: date,
    };
    const organizationDateParent = {
      organization_id: organizationId,
      local_date: date,
    };
    if (layers.organizationWeekly.length)
      await db
        .insertInto("organization_weekly_hours")
        .values(
          layers.organizationWeekly.map((interval) => ({
            organization_id: organizationId,
            weekday: 1,
            start_minute: interval.startMinute,
            end_minute: interval.endMinute,
          })),
        )
        .execute();
    if (layers.resourceWeekly.mode !== "inherit") {
      await db
        .insertInto("resource_weekly_hours_override")
        .values(weeklyParent)
        .execute();
      if (layers.resourceWeekly.intervals.length)
        await db
          .insertInto("resource_weekly_hours_interval")
          .values(
            layers.resourceWeekly.intervals.map((interval) => ({
              ...weeklyParent,
              start_minute: interval.startMinute,
              end_minute: interval.endMinute,
            })),
          )
          .execute();
    }
    if (layers.organizationDate.mode !== "inherit") {
      await db
        .insertInto("organization_date_override")
        .values(organizationDateParent)
        .execute();
      if (layers.organizationDate.intervals.length)
        await db
          .insertInto("organization_date_override_interval")
          .values(
            layers.organizationDate.intervals.map((interval) => ({
              ...organizationDateParent,
              start_minute: interval.startMinute,
              end_minute: interval.endMinute,
            })),
          )
          .execute();
    }
    if (layers.resourceDate.mode !== "inherit") {
      await db
        .insertInto("resource_date_override")
        .values(dateParent)
        .execute();
      if (layers.resourceDate.intervals.length)
        await db
          .insertInto("resource_date_override_interval")
          .values(
            layers.resourceDate.intervals.map((interval) => ({
              ...dateParent,
              start_minute: interval.startMinute,
              end_minute: interval.endMinute,
            })),
          )
          .execute();
    }
  };
  const success = (
    intervals: { startMinute: number; endMinute: number }[],
    targetDate = date,
  ) => ({
    ok: true,
    schedule: {
      timezone: "Asia/Jerusalem",
      resourceId,
      date: targetDate,
      intervals,
    },
  });
  return { ...input, resolve, role, seed, success };
}

describe("Resource schedule resolver", () => {
  it.each<
    [
      string,
      Partial<AvailabilityLayers>,
      { startMinute: number; endMinute: number }[],
    ]
  >([
    ["Organization weekly only", {}, baseline],
    ["empty configuration", { organizationWeekly: [] }, []],
    [
      "Resource weekly custom replaces baseline",
      { resourceWeekly: custom(480, 1080) },
      [{ startMinute: 480, endMinute: 1080 }],
    ],
    ["Resource weekly closed", { resourceWeekly: closed }, []],
    [
      "Organization date custom replaces recurring",
      { resourceWeekly: custom(600, 960), organizationDate: custom(660, 900) },
      [{ startMinute: 660, endMinute: 900 }],
    ],
    [
      "Organization date closed beats Resource custom",
      {
        resourceWeekly: custom(600, 960),
        organizationDate: closed,
        resourceDate: custom(0, 1440),
      },
      [],
    ],
    [
      "all four layers use Resource date custom",
      {
        resourceWeekly: custom(600, 960),
        organizationDate: custom(660, 900),
        resourceDate: custom(540, 1080),
      },
      [{ startMinute: 540, endMinute: 1080 }],
    ],
    [
      "Resource date opens recurring closed",
      { resourceWeekly: closed, resourceDate: custom(600, 840) },
      [{ startMinute: 600, endMinute: 840 }],
    ],
    [
      "Resource weekly opens empty baseline",
      { organizationWeekly: [], resourceWeekly: custom(600, 840) },
      [{ startMinute: 600, endMinute: 840 }],
    ],
    [
      "Resource date closed replaces Organization custom",
      { organizationDate: custom(600, 840), resourceDate: closed },
      [],
    ],
    [
      "Organization custom opens recurring closed",
      { resourceWeekly: closed, organizationDate: custom(660, 900) },
      [{ startMinute: 660, endMinute: 900 }],
    ],
    [
      "multiple intervals sorted without merging",
      {
        resourceDate: {
          mode: "custom",
          intervals: [
            { startMinute: 720, endMinute: 900 },
            { startMinute: 540, endMinute: 720 },
          ],
        },
      },
      [
        { startMinute: 540, endMinute: 720 },
        { startMinute: 720, endMinute: 900 },
      ],
    ],
  ])("%s", async (_name, layers, expected) => {
    const f = await fixture();
    await f.seed(layers);
    expect(await f.resolve()).toEqual(f.success(expected));
  });

  it.each([1, 2, 3, 4, 5, 6, 7])(
    "selects ISO weekday %s only",
    async (weekday) => {
      const f = await fixture();
      await db
        .insertInto("organization_weekly_hours")
        .values(
          Array.from({ length: 7 }, (_, index) => ({
            organization_id: f.organizationId,
            weekday: index + 1,
            start_minute: (index + 1) * 60,
            end_minute: (index + 1) * 60 + 30,
          })),
        )
        .execute();
      const targetDate = `2026-10-${String(weekday + 4).padStart(2, "0")}`;
      expect(await f.resolve({ date: targetDate })).toEqual(
        f.success(
          [{ startMinute: weekday * 60, endMinute: weekday * 60 + 30 }],
          targetDate,
        ),
      );
    },
  );

  it("ignores other Resources, dates, weekdays and Organizations", async () => {
    const f = await fixture();
    const other = await fixture();
    await f.seed();
    await other.seed({ resourceDate: custom(0, 1440) });
    const second = await db
      .insertInto("resource")
      .values({
        organization_id: f.organizationId,
        user_id: null,
        name: "Second",
        deactivated_at: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("resource_weekly_hours_override")
      .values([
        {
          organization_id: f.organizationId,
          resource_id: f.resourceId,
          weekday: 2,
        },
        {
          organization_id: f.organizationId,
          resource_id: second.id,
          weekday: 1,
        },
      ])
      .execute();
    await db
      .insertInto("organization_date_override")
      .values({ organization_id: f.organizationId, local_date: "2026-10-06" })
      .execute();
    await db
      .insertInto("resource_date_override")
      .values([
        {
          organization_id: f.organizationId,
          resource_id: f.resourceId,
          local_date: "2026-10-06",
        },
        {
          organization_id: f.organizationId,
          resource_id: second.id,
          local_date: date,
        },
      ])
      .execute();
    expect(await f.resolve()).toEqual(f.success(baseline));
  });

  it.each([
    ["owner", "owner", true],
    ["owner", "manager", true],
    ["owner", "staff", true],
    ["owner", "unlinked", true],
    ["manager", "unlinked", true],
    ["manager", "staff", true],
    ["manager", "owner", false],
    ["manager", "manager", false],
    ["staff", "self", true],
    ["staff", "staff", false],
    ["staff", "unlinked", false],
    ["staff", "owner", false],
    ["staff", "manager", false],
  ] as const)(
    "%s resolving %s Resource: allowed=%s",
    async (actorRole, linkedRole, allowed) => {
      const f = await fixture();
      await f.seed();
      await f.role(actorRole);
      if (linkedRole !== "unlinked") {
        let linkedUserId = f.userId;
        if (linkedRole !== "self") {
          const linked = await fixture();
          linkedUserId = linked.userId;
          await db
            .insertInto("membership")
            .values({
              organization_id: f.organizationId,
              user_id: linkedUserId,
              role: linkedRole,
            })
            .execute();
        }
        await db
          .updateTable("resource")
          .set({ user_id: linkedUserId })
          .where("id", "=", f.resourceId)
          .execute();
      }
      expect(await f.resolve()).toEqual(
        allowed
          ? f.success(baseline)
          : { ok: false, reason: "insufficient_role" },
      );
    },
  );

  it("hides non-member Organizations and cross-tenant/missing Resources", async () => {
    const f = await fixture();
    const other = await fixture();
    for (const organizationId of [other.organizationId, randomUUID()]) {
      expect(await f.resolve({ organizationId })).toEqual({
        ok: false,
        reason: "organization_not_found",
      });
    }
    for (const resourceId of [other.resourceId, randomUUID()]) {
      expect(await f.resolve({ resourceId })).toEqual({
        ok: false,
        reason: "resource_not_found",
      });
    }
  });

  it.each([
    "2026-02-30",
    "2026-13-01",
    "1900-02-29",
    "0000-01-01",
    "2026-1-01",
    "2026-10-05\n",
    "2026-10-05T00:00:00Z",
  ])("rejects invalid local date %j", async (date) => {
    const f = await fixture();
    expect(await f.resolve({ date })).toEqual({
      ok: false,
      reason: "invalid_date",
    });
  });

  it("resolves a deactivated Resource without changing lifecycle or configuration", async () => {
    const f = await fixture();
    await f.seed({ resourceDate: custom(600, 840) });
    await db
      .updateTable("resource")
      .set({ deactivated_at: new Date() })
      .where("id", "=", f.resourceId)
      .execute();
    const resource = await db
      .selectFrom("resource")
      .selectAll()
      .where("id", "=", f.resourceId)
      .executeTakeFirstOrThrow();
    const intervals = await db
      .selectFrom("resource_date_override_interval")
      .selectAll()
      .execute();
    expect(await f.resolve()).toEqual(
      f.success([{ startMinute: 600, endMinute: 840 }]),
    );
    expect(
      await db
        .selectFrom("resource")
        .selectAll()
        .where("id", "=", f.resourceId)
        .executeTakeFirstOrThrow(),
    ).toEqual(resource);
    expect(
      await db
        .selectFrom("resource_date_override_interval")
        .selectAll()
        .execute(),
    ).toEqual(intervals);
  });

  it.each(["archived", "suspended"] as const)(
    "allows management reads of %s Organizations",
    async (state) => {
      const f = await fixture();
      await f.seed();
      await db
        .updateTable("organization")
        .set(
          state === "archived"
            ? { archived_at: new Date() }
            : { suspended_at: new Date() },
        )
        .where("id", "=", f.organizationId)
        .execute();
      const organization = await db
        .selectFrom("organization")
        .selectAll()
        .where("id", "=", f.organizationId)
        .executeTakeFirstOrThrow();
      expect(await f.resolve()).toEqual(f.success(baseline));
      expect(
        await db
          .selectFrom("organization")
          .selectAll()
          .where("id", "=", f.organizationId)
          .executeTakeFirstOrThrow(),
      ).toEqual(organization);
    },
  );
});
