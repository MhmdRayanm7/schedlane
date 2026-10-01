import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGuestBooking,
  getBookingContext,
  getNextAvailability,
  getPublicAvailability,
} from "../src/features/public-booking/api/public-booking-api";
import {
  initialBookingSelection,
  visibleBookingSteps,
} from "../src/features/public-booking/lib/booking-flow";
import type { PublicService } from "../src/features/public-booking/types";

const service = (id: string, resources: string[]): PublicService => ({
  id,
  name: id,
  durationMinutes: 30,
  priceAgorot: null,
  resources: resources.map((id) => ({ id, name: id })),
});

afterEach(() => vi.unstubAllGlobals());

describe("scoped public booking requests", () => {
  it("preserves the opaque share token across every public request", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const token = "opaque_-token";

    await getBookingContext("demo", token);
    await getPublicAvailability(
      "demo",
      "service",
      "resource",
      "2026-10-10",
      token,
    );
    await getNextAvailability(
      "demo",
      "service",
      "resource",
      "2026-10-10",
      token,
    );
    await createGuestBooking(
      "demo",
      {
        serviceId: "service",
        resourceId: "resource",
        date: "2026-10-10",
        startMinute: 600,
        guestName: "Guest",
        guestPhone: "0501234567",
        guestEmail: "",
        customerNote: "",
      },
      token,
    );

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/booking-context?share=opaque_-token"),
      expect.stringContaining(
        "/availability?serviceId=service&resourceId=resource&date=2026-10-10&share=opaque_-token",
      ),
      expect.stringContaining(
        "/availability/next?serviceId=service&resourceId=resource&fromDate=2026-10-10&share=opaque_-token",
      ),
      expect.stringContaining("/bookings?share=opaque_-token"),
    ]);
  });

  it("leaves unscoped request URLs unchanged", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getBookingContext("demo");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/booking-context");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("share=");
  });
});

describe("scoped adaptive steps", () => {
  it("skips a locked Service but leaves multiple Resources selectable", () => {
    const services = [service("haircut", ["mohammad", "sara"])];
    expect(initialBookingSelection(services)).toEqual({
      serviceId: "haircut",
      resourceId: "",
    });
    expect(visibleBookingSteps(services, "haircut")).toEqual([
      "resource",
      "dateTime",
      "details",
      "review",
    ]);
  });

  it("leaves Service selectable while every option is locked to one Resource", () => {
    const services = [
      service("haircut", ["mohammad"]),
      service("color", ["mohammad"]),
    ];
    expect(initialBookingSelection(services)).toEqual({
      serviceId: "",
      resourceId: "",
    });
    expect(visibleBookingSteps(services, "haircut")).toEqual([
      "service",
      "dateTime",
      "details",
      "review",
    ]);
  });

  it("skips both choices without selecting a Date or Time", () => {
    const services = [service("haircut", ["mohammad"])];
    expect(visibleBookingSteps(services, "haircut")[0]).toBe("dateTime");
    expect(initialBookingSelection(services)).toEqual({
      serviceId: "haircut",
      resourceId: "mohammad",
    });
  });
});
