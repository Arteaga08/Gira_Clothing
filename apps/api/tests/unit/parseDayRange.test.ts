import { describe, it, expect } from "vitest";
import { parseDayRange, TIMEZONE, MAX_DAYS } from "../../src/utils/parseDayRange.js";

describe("parseDayRange", () => {
  it("default son 30 días", () => {
    const range = parseDayRange({});
    expect(range.days).toBe(30);
    expect(range.dayKeys).toHaveLength(30);
  });

  it("dayKeys tiene exactamente `days` elementos, en orden ascendente, sin huecos", () => {
    const range = parseDayRange({ days: 7 });
    expect(range.dayKeys).toHaveLength(7);
    const sorted = [...range.dayKeys].sort();
    expect(range.dayKeys).toEqual(sorted);
    // contiguos: cada día es el siguiente calendario del anterior
    for (let i = 1; i < range.dayKeys.length; i += 1) {
      const prev = new Date(`${range.dayKeys[i - 1]}T00:00:00Z`);
      const curr = new Date(`${range.dayKeys[i]}T00:00:00Z`);
      expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("el último día del rango es hoy (día calendario local)", () => {
    const range = parseDayRange({ days: 7 });
    const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
    expect(range.dayKeys.at(-1)).toBe(todayLocal);
  });

  it("`from` es medianoche local del primer día, no una ventana rodante de 24h", () => {
    const range = parseDayRange({ days: 7 });
    const firstDayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(range.from);
    expect(firstDayLocal).toBe(range.dayKeys[0]);
    // medianoche exacta: formatear la hora local debe dar 00
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).format(range.from);
    expect(["00", "24"]).toContain(hour);
  });

  it("clampea a MAX_DAYS", () => {
    const range = parseDayRange({ days: 400 });
    expect(range.days).toBe(MAX_DAYS);
    expect(range.dayKeys).toHaveLength(MAX_DAYS);
  });

  it("ignora un days inválido y usa el default", () => {
    expect(parseDayRange({ days: "no-es-numero" }).days).toBe(30);
    expect(parseDayRange({ days: -5 }).days).toBe(30);
    expect(parseDayRange({ days: 0 }).days).toBe(30);
  });

  it("expone timezone como America/Mexico_City", () => {
    expect(parseDayRange({}).timezone).toBe("America/Mexico_City");
  });
});
