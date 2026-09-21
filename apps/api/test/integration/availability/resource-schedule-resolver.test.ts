import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../../src/db.js";
import type { MembershipRole } from "../../../src/db-types.js";
import type {
  AvailabilityLayers,
  ScheduleOverride,
} from "../../../src/modules/availability/domain/resource-schedule.js";
import {
  resolveResourceScheduleForDate,
  resolveResourceWorkingWindowsForDate,
} from "../../../src/modules/availability/resolvers/resource-schedule.js";

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
  const resolveWorkingWindows = (changes: Partial<typeof input> = {}) =>
    resolveResourceWorkingWindowsForDate({ ...input, ...changes });
  const block = (
    startMinute: number,
    endMinute: number,
    changes: Partial<typeof input> = {},
  ) => {
    const target = { ...input, ...changes };
    return db
      .insertInto("resource_time_block")
      .values({
        organization_id: target.organizationId,
        resource_id: target.resourceId,
        local_date: target.date,
        start_minute: startMinute,
        end_minute: endMinute,
      })
      .execute();
  };
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
  const windowsSuccess = (
    intervals: { startMinute: number; endMinute: number }[],
  ) => ({
    ok: true,
    workingWindows: success(intervals).schedule,
  });
  return {
    ...input,
    resolve,
    resolveWorkingWindows,
    block,
    role,
    seed,
    success,
    windowsSuccess,
  };
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

describe("Resource working windows resolver", () => {
  const interval = (startMinute: number, endMinute: number) => ({
    startMinute,
    endMinute,
  });
  type Interval = ReturnType<typeof interval>;

  it.each<[string, Partial<AvailabilityLayers>, Interval[], Interval[]]>([
    ["no Time Blocks", {}, [], baseline],
    [
      "middle Time Block",
      {},
      [interval(780, 840)],
      [interval(540, 780), interval(840, 1020)],
    ],
    [
      "multiple Time Blocks inserted out of order",
      {},
      [interval(900, 960), interval(600, 660), interval(780, 840)],
      [
        interval(540, 600),
        interval(660, 780),
        interval(840, 900),
        interval(960, 1020),
      ],
    ],
    ["outside configured hours", {}, [interval(1080, 1140)], baseline],
    [
      "half-open boundary touches",
      {},
      [interval(480, 540), interval(1020, 1080)],
      baseline,
    ],
    ["fully covered schedule", {}, [interval(480, 1080)], []],
    [
      "empty configured schedule",
      { organizationWeekly: [] },
      [interval(600, 660)],
      [],
    ],
    [
      "block spans multiple working intervals",
      { organizationWeekly: [interval(540, 720), interval(780, 1020)] },
      [interval(660, 840)],
      [interval(540, 660), interval(840, 1020)],
    ],
    [
      "Resource weekly custom",
      { resourceWeekly: custom(480, 1080) },
      [interval(600, 660)],
      [interval(480, 600), interval(660, 1080)],
    ],
    [
      "Organization date custom overrides Resource weekly",
      { resourceWeekly: custom(480, 1080), organizationDate: custom(600, 900) },
      [interval(720, 780)],
      [interval(600, 720), interval(780, 900)],
    ],
    [
      "Resource date custom overrides all other layers",
      {
        resourceWeekly: custom(480, 1080),
        organizationDate: custom(600, 900),
        resourceDate: custom(660, 960),
      },
      [interval(720, 780)],
      [interval(660, 720), interval(780, 960)],
    ],
    [
      "Resource date extra-day opens recurring closure",
      {
        organizationWeekly: [],
        resourceWeekly: closed,
        resourceDate: custom(600, 840),
      },
      [interval(660, 720)],
      [interval(600, 660), interval(720, 840)],
    ],
    [
      "Organization date CLOSED remains terminal",
      { organizationDate: closed, resourceDate: custom(0, 1440) },
      [interval(600, 660)],
      [],
    ],
    [
      "Resource date CLOSED",
      { resourceDate: closed },
      [interval(600, 660)],
      [],
    ],
    [
      "adjacent configured intervals remain separate without blocks",
      { organizationWeekly: [interval(540, 720), interval(720, 1020)] },
      [],
      [interval(540, 720), interval(720, 1020)],
    ],
    [
      "adjacent configured intervals remain separate after subtraction",
      { organizationWeekly: [interval(540, 720), interval(720, 1020)] },
      [interval(900, 960)],
      [interval(540, 720), interval(720, 900), interval(960, 1020)],
    ],
  ])("%s", async (_name, layers, blocks, expected) => {
    const f = await fixture();
    await f.seed(layers);
    const configured = await f.resolve();
    for (const block of blocks)
      await f.block(block.startMinute, block.endMinute);
    expect(await f.resolveWorkingWindows()).toEqual(f.windowsSuccess(expected));
    // Time Blocks must never change the existing configured-schedule resolver.
    expect(await f.resolve()).toEqual(configured);
    if (blocks.length === 0) expect(configured).toEqual(f.success(expected));
  });

  it("subtracts only the requested Organization, Resource and local date", async () => {
    const f = await fixture();
    const other = await fixture();
    await f.seed();
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
    await other.block(0, 1440);
    await f.block(0, 1440, { date: "2026-10-06" });
    await f.block(0, 1440, { resourceId: second.id });
    expect(await f.resolveWorkingWindows()).toEqual(f.windowsSuccess(baseline));
    await f.block(780, 840);
    expect(await f.resolveWorkingWindows()).toEqual(
      f.windowsSuccess([interval(540, 780), interval(840, 1020)]),
    );
  });

  it.each([
    ["owner", "owner", true],
    ["manager", "unlinked", true],
    ["manager", "staff", true],
    ["manager", "owner", false],
    ["manager", "manager", false],
    ["staff", "self", true],
    ["staff", "staff", false],
    ["staff", "unlinked", false],
  ] as const)(
    "%s resolving %s Resource preserves policy: allowed=%s",
    async (actorRole, linkedRole, allowed) => {
      const f = await fixture();
      await f.seed();
      await f.block(780, 840);
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
      expect(await f.resolveWorkingWindows()).toEqual(
        allowed
          ? f.windowsSuccess([interval(540, 780), interval(840, 1020)])
          : { ok: false, reason: "insufficient_role" },
      );
    },
  );

  it("preserves anti-leak failures and authorization before date validation", async () => {
    const f = await fixture();
    const other = await fixture();
    for (const targetDate of [date, "2026-02-30"]) {
      for (const organizationId of [other.organizationId, randomUUID()]) {
        expect(
          await f.resolveWorkingWindows({ organizationId, date: targetDate }),
        ).toEqual({
          ok: false,
          reason: "organization_not_found",
        });
      }
      for (const resourceId of [other.resourceId, randomUUID()]) {
        expect(
          await f.resolveWorkingWindows({ resourceId, date: targetDate }),
        ).toEqual({
          ok: false,
          reason: "resource_not_found",
        });
      }
    }
    expect(await f.resolveWorkingWindows({ date: "2026-02-30" })).toEqual({
      ok: false,
      reason: "invalid_date",
    });
    await f.role("staff");
    expect(await f.resolveWorkingWindows({ date: "2026-02-30" })).toEqual({
      ok: false,
      reason: "insufficient_role",
    });
  });

  it.each(["deactivated", "archived", "suspended"] as const)(
    "preserves management reads when %s without modifying persisted state",
    async (state) => {
      const f = await fixture();
      await f.seed();
      await f.block(780, 840);
      if (state === "deactivated") {
        await db
          .updateTable("resource")
          .set({ deactivated_at: new Date() })
          .where("id", "=", f.resourceId)
          .execute();
      } else {
        await db
          .updateTable("organization")
          .set(
            state === "archived"
              ? { archived_at: new Date() }
              : { suspended_at: new Date() },
          )
          .where("id", "=", f.organizationId)
          .execute();
      }
      const read = async () => ({
        organization: await db
          .selectFrom("organization")
          .selectAll()
          .where("id", "=", f.organizationId)
          .executeTakeFirstOrThrow(),
        resource: await db
          .selectFrom("resource")
          .selectAll()
          .where("id", "=", f.resourceId)
          .executeTakeFirstOrThrow(),
        weekly: await db
          .selectFrom("organization_weekly_hours")
          .selectAll()
          .where("organization_id", "=", f.organizationId)
          .execute(),
        blocks: await db
          .selectFrom("resource_time_block")
          .selectAll()
          .where("resource_id", "=", f.resourceId)
          .execute(),
      });
      const before = await read();
      expect(await f.resolveWorkingWindows()).toEqual(
        f.windowsSuccess([interval(540, 780), interval(840, 1020)]),
      );
      expect(await read()).toEqual(before);
    },
  );
});
