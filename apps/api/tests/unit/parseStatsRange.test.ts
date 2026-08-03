import { describe, it, expect } from "vitest";
import { parseStatsRange, MAX_DAYS } from "../../src/utils/parseStatsRange.js";

describe("parseStatsRange", () => {
  it("usa el default del módulo cuando no viene days", () => {
    const range = parseStatsRange({}, 30);
    expect(range.days).toBe(30);
    expect(range.to.getTime()).toBeGreaterThan(range.from.getTime());
  });
  it("respeta un days válido", () => {
    expect(parseStatsRange({ days: "7" }, 30).days).toBe(7);
  });
  it("cae al default con basura, cero o negativo", () => {
    for (const days of ["abc", "0", "-5", "", null, undefined]) {
      expect(parseStatsRange({ days }, 30).days).toBe(30);
    }
  });
  it(`topa el rango en ${MAX_DAYS} días`, () => {
    expect(parseStatsRange({ days: "5000" }, 30).days).toBe(MAX_DAYS);
  });
  it("la ventana mide exactamente days * 24h", () => {
    const range = parseStatsRange({ days: "2" }, 30);
    expect(range.to.getTime() - range.from.getTime()).toBe(2 * 24 * 60 * 60 * 1000);
  });
});
