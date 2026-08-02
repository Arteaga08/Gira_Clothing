import { describe, expect, it } from "vitest";
import { DEFAULT_RANGE_DAYS, RANGE_OPTIONS, parseRangeDays } from "@/lib/stats/range";

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
});
