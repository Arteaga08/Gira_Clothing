import { describe, expect, it } from "vitest";
import { endOfMxDayIso, formatMxDate, isoToMxInput, parseMxDate, startOfMxDayIso } from "@/lib/coupons/dates";

describe("fechas de México", () => {
  it("parsea dd/mm/aaaa", () => {
    expect(parseMxDate("01/06/2026")).toEqual({ y: 2026, m: 6, d: 1 });
  });

  it.each(["1/6/26", "32/01/2026", "31/02/2026", "2026-06-01", "", "00/01/2026"])("rechaza «%s»", (value) => {
    expect(parseMxDate(value)).toBeNull();
  });

  it("inicio 00:00 y fin 23:59:59 con -06:00", () => {
    expect(startOfMxDayIso({ y: 2026, m: 6, d: 1 })).toBe("2026-06-01T06:00:00.000Z");
    expect(endOfMxDayIso({ y: 2026, m: 6, d: 1 })).toBe("2026-06-02T05:59:59.000Z");
  });

  it("ida y vuelta del input", () => {
    expect(isoToMxInput("2026-06-01T06:00:00.000Z")).toBe("01/06/2026");
    expect(isoToMxInput("2026-06-02T05:59:59.000Z")).toBe("01/06/2026");
  });

  it("formatMxDate", () => {
    expect(formatMxDate("2026-06-01T06:00:00.000Z")).toBe("01 jun 2026");
    expect(formatMxDate("2026-12-26T05:59:59.000Z")).toBe("25 dic 2026");
  });
});
