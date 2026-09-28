import { describe, expect, it } from "vitest";
import { isServicePriceInputValid } from "./pricing";

describe("Service price form policy", () => {
  it("accepts a blank price when organization pricing is off", () => {
    expect(isServicePriceInputValid("", false)).toBe(true);
    expect(isServicePriceInputValid("   ", false)).toBe(true);
  });

  it("requires a price when organization pricing is on", () => {
    expect(isServicePriceInputValid("", true)).toBe(false);
    expect(isServicePriceInputValid("70", true)).toBe(true);
  });
});
