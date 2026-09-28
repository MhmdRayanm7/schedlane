import { describe, expect, it } from "vitest";
import { shouldEnterPlatform } from "../src/features/organizations/lib/entry-route";
import {
  guestFieldForApiError,
  initialBookingSelection,
  selectionAfterServiceChange,
  validateGuestDetails,
  visibleBookingSteps,
} from "../src/features/public-booking/lib/booking-flow";
import { managedBookingPresentation } from "../src/features/public-booking/lib/managed-booking-state";
import type { PublicService } from "../src/features/public-booking/types";

const service = (id: string, resourceIds: string[]): PublicService => ({
  id,
  name: `Service ${id}`,
  durationMinutes: 30,
  priceAgorot: null,
  resources: resourceIds.map((resourceId) => ({
    id: resourceId,
    name: `Resource ${resourceId}`,
  })),
});

describe("adaptive public booking flow", () => {
  it("auto-selects a single service and resource and starts at date/time", () => {
    const services = [service("s1", ["r1"])];
    expect(initialBookingSelection(services)).toEqual({
      serviceId: "s1",
      resourceId: "r1",
    });
    expect(visibleBookingSteps(services, "s1")).toEqual([
      "dateTime",
      "details",
      "review",
    ]);
  });

  it("keeps multiple services and resources as visible decisions", () => {
    const services = [service("s1", ["r1", "r2"]), service("s2", ["r3"])];
    expect(initialBookingSelection(services)).toEqual({
      serviceId: "",
      resourceId: "",
    });
    expect(visibleBookingSteps(services, "s1")).toEqual([
      "service",
      "resource",
      "dateTime",
      "details",
      "review",
    ]);
  });

  it("starts with Resource when the only service has multiple resources", () => {
    const services = [service("s1", ["r1", "r2"])];
    expect(visibleBookingSteps(services, "")).toEqual([
      "resource",
      "dateTime",
      "details",
      "review",
    ]);
  });

  it("recalculates resource selection when the service changes", () => {
    const services = [service("s1", ["r1", "r2"]), service("s2", ["r3"])];
    expect(selectionAfterServiceChange(services, "s2", "r1")).toEqual({
      serviceId: "s2",
      resourceId: "r3",
    });
    expect(selectionAfterServiceChange(services, "s1", "r3")).toEqual({
      serviceId: "s1",
      resourceId: "",
    });
  });
});

describe("public guest validation", () => {
  it("rejects whitespace names and invalid phones before review", () => {
    expect(
      validateGuestDetails({
        guestName: "   ",
        guestPhone: "123",
        guestEmail: "",
      }),
    ).toMatchObject({
      guestName: expect.any(String),
      guestPhone: expect.any(String),
    });
  });

  it("accepts a valid Israeli phone and blank optional email", () => {
    expect(
      validateGuestDetails({
        guestName: "Dana",
        guestPhone: "050-123-4567",
        guestEmail: "",
      }),
    ).toEqual({});
  });

  it("rejects an invalid nonblank email", () => {
    expect(
      validateGuestDetails({
        guestName: "Dana",
        guestPhone: "050-123-4567",
        guestEmail: "not-an-email",
      }),
    ).toHaveProperty("guestEmail");
  });

  it("maps server phone validation back to the phone field", () => {
    expect(guestFieldForApiError("INVALID_GUEST_PHONE")).toBe("guestPhone");
  });
});

describe("guest booking presentation", () => {
  const base = {
    status: "confirmed" as const,
    serviceEndAt: "2026-09-28T09:00:00.000Z",
    canCancel: false,
    canEditContact: false,
  };

  it("keeps active confirmed bookings manageable", () => {
    expect(
      managedBookingPresentation(
        { ...base, canCancel: true },
        new Date("2026-09-28T10:00:00.000Z"),
      ),
    ).toBe("active");
  });

  it("treats cancelled, no-show, and elapsed confirmed bookings as terminal", () => {
    expect(managedBookingPresentation({ ...base, status: "cancelled" })).toBe(
      "cancelled",
    );
    expect(managedBookingPresentation({ ...base, status: "no_show" })).toBe(
      "noShow",
    );
    expect(
      managedBookingPresentation(base, new Date("2026-09-28T10:00:00.000Z")),
    ).toBe("past");
  });
});

describe("authenticated entry routing", () => {
  it("routes only platform-only users to Platform Admin", () => {
    expect(shouldEnterPlatform(0, true)).toBe(true);
    expect(shouldEnterPlatform(1, true)).toBe(false);
    expect(shouldEnterPlatform(0, false)).toBe(false);
  });
});
