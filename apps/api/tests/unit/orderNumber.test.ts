import { describe, it, expect } from "vitest";
import { ORDER_NUMBER_PATTERN } from "@gira/shared";
import { generateOrderNumber } from "../../src/utils/orderNumber.js";

describe("generateOrderNumber", () => {
  it("respeta el formato GC-XXXXXXXX sin I/O/0/1", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateOrderNumber()).toMatch(ORDER_NUMBER_PATTERN);
    }
  });

  it("no repite en una muestra razonable", () => {
    const seen = new Set(Array.from({ length: 2000 }, generateOrderNumber));
    expect(seen.size).toBe(2000);
  });
});
