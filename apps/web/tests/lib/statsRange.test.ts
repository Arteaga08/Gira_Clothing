import { describe, expect, it } from "vitest";
import { DEFAULT_RANGE_DAYS, RANGE_OPTIONS, parseGranularity, parseRangeDays } from "@/lib/stats/range";

describe("parseRangeDays", () => {
  it.each([
    ["7", 7],
    ["30", 30],
    ["90", 90],
    [undefined, DEFAULT_RANGE_DAYS],
    ["45", DEFAULT_RANGE_DAYS],
    ["abc", DEFAULT_RANGE_DAYS],
    ["-1", DEFAULT_RANGE_DAYS],
    ["1e3", DEFAULT_RANGE_DAYS],
    [["7", "90"], DEFAULT_RANGE_DAYS],
  ] as const)("parseRangeDays(%o) -> %i", (input, expected) => {
    expect(parseRangeDays(input)).toBe(expected);
  });

  it("RANGE_OPTIONS es exactamente [7, 30, 90]", () => {
    expect(RANGE_OPTIONS).toEqual([7, 30, 90]);
  });

  it("cada granularidad tiene su propia whitelist de rango", () => {
    expect(parseRangeDays("180", "week")).toBe(180);
    expect(parseRangeDays("45", "week")).toBe(90); // fuera de whitelist -> default de la granularidad
    expect(parseRangeDays("365", "month")).toBe(365);
    expect(parseRangeDays(undefined, "month")).toBe(365);
    expect(parseRangeDays("730", "year")).toBe(730);
    expect(parseRangeDays("90", "year")).toBe(730); // year solo ofrece 730
  });
});

describe("parseGranularity", () => {
  it.each([
    ["day", "day"],
    ["week", "week"],
    ["month", "month"],
    ["year", "year"],
    [undefined, "day"],
    ["abc", "day"],
    [["week", "month"], "day"],
  ] as const)("parseGranularity(%o) -> %s", (input, expected) => {
    expect(parseGranularity(input)).toBe(expected);
  });
});
