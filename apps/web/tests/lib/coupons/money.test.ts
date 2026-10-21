import { describe, expect, it } from "vitest";
import { centsToPesosInput, formatMxn, pesosToCents } from "@/lib/coupons/money";

describe("pesosToCents", () => {
  it.each([
    ["150", 15000],
    ["150.5", 15050],
    ["150.50", 15050],
    ["0.01", 1],
    [" 799 ", 79900],
    ["1,500.00", 150000],
  ])("%s -> %s", (input, cents) => {
    expect(pesosToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "10.999", "-5", "1.2.3", "10.", ".5x"])("rechaza «%s» sin redondear", (input) => {
    expect(pesosToCents(input)).toBeNull();
  });
});

describe("formato", () => {
  it("centsToPesosInput", () => {
    expect(centsToPesosInput(15050)).toBe("150.50");
    expect(centsToPesosInput(15000)).toBe("150.00");
  });

  it("formatMxn", () => {
    expect(formatMxn(79900)).toBe("$799.00");
    expect(formatMxn(150000)).toBe("$1,500.00");
  });
});
