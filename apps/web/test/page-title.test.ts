import { describe, expect, it } from "vitest";
import { formatPageTitle } from "../src/shared/lib/page-title";

describe("page title formatting", () => {
  it("falls back to Schedlane when title is empty or undefined", () => {
    expect(formatPageTitle()).toBe("Schedlane");
    expect(formatPageTitle("")).toBe("Schedlane");
    expect(formatPageTitle("   ")).toBe("Schedlane");
  });

  it("appends — Schedlane to standard page titles", () => {
    expect(formatPageTitle("Bookings")).toBe("Bookings — Schedlane");
    expect(formatPageTitle("Services")).toBe("Services — Schedlane");
    expect(formatPageTitle("Resources")).toBe("Resources — Schedlane");
    expect(formatPageTitle("Schedule")).toBe("Schedule — Schedlane");
    expect(formatPageTitle("Team")).toBe("Team — Schedlane");
    expect(formatPageTitle("Settings")).toBe("Settings — Schedlane");
    expect(formatPageTitle("Organization Requests")).toBe(
      "Organization Requests — Schedlane",
    );
    expect(formatPageTitle("Sign In")).toBe("Sign In — Schedlane");
    expect(formatPageTitle("Create Account")).toBe(
      "Create Account — Schedlane",
    );
    expect(formatPageTitle("Page Not Found")).toBe(
      "Page Not Found — Schedlane",
    );
  });

  it("avoids duplicate suffix if title already ends with Schedlane", () => {
    expect(formatPageTitle("Bookings — Schedlane")).toBe(
      "Bookings — Schedlane",
    );
  });

  it("preserves organization booking and manage page titles without redundant Schedlane suffix", () => {
    expect(formatPageTitle("Schedlane QA — Book Appointment")).toBe(
      "Schedlane QA — Book Appointment",
    );
    expect(formatPageTitle("Acme Studio — Book Appointment")).toBe(
      "Acme Studio — Book Appointment",
    );
    expect(formatPageTitle("Schedlane QA — Manage Booking")).toBe(
      "Schedlane QA — Manage Booking",
    );
    expect(formatPageTitle("Book Appointment")).toBe(
      "Book Appointment — Schedlane",
    );
    expect(formatPageTitle("Manage Booking")).toBe(
      "Manage Booking — Schedlane",
    );
  });
});
