import { describe, it, expect } from "vitest";
import { resolveCurrentPeriod } from "../../src/utils/resolveCurrentPeriod.js";
import { TIMEZONE } from "../../src/utils/parseDayRange.js";

const localDayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE });
const hourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "2-digit", hour12: false });
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" });
const dayOfMonthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, day: "2-digit" });

describe("resolveCurrentPeriod", () => {
  it('"today": from es medianoche local de hoy, to es ahora (no una foto de "todo el día")', () => {
    const before = Date.now();
    const range = resolveCurrentPeriod({ period: "today" });
    const after = Date.now();

    expect(range.preset).toBe("today");
    expect(range.to.getTime()).toBeGreaterThanOrEqual(before);
    expect(range.to.getTime()).toBeLessThanOrEqual(after);
    expect(localDayFormatter.format(range.from)).toBe(localDayFormatter.format(new Date()));
    expect(["00", "24"]).toContain(hourFormatter.format(range.from));
  });

  it('"week": from cae en lunes, cualquiera que sea el día de hoy', () => {
    const range = resolveCurrentPeriod({ period: "week" });
    expect(range.preset).toBe("week");
    expect(weekdayFormatter.format(range.from)).toBe("Mon");
    expect(range.from.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('"month": from es el día 1 del mes en curso', () => {
    const range = resolveCurrentPeriod({ period: "month" });
    expect(range.preset).toBe("month");
    expect(dayOfMonthFormatter.format(range.from)).toBe("01");
  });

  it('"custom": el día completo pedido (medianoche a medianoche), sin recortar a "ahora"', () => {
    const range = resolveCurrentPeriod({ period: "custom", fecha: "2026-07-01" });
    expect(range.preset).toBe("custom");
    expect(localDayFormatter.format(range.from)).toBe("2026-07-01");
    expect(localDayFormatter.format(range.to)).toBe("2026-07-02");
    expect(["00", "24"]).toContain(hourFormatter.format(range.from));
  });

  it('"custom" con una fecha futura no se recorta a "ahora"', () => {
    const range = resolveCurrentPeriod({ period: "custom", fecha: "2099-01-15" });
    expect(localDayFormatter.format(range.from)).toBe("2099-01-15");
    expect(localDayFormatter.format(range.to)).toBe("2099-01-16");
  });

  it('"custom" cruzando fin de mes: el día siguiente cae en el mes correcto', () => {
    const range = resolveCurrentPeriod({ period: "custom", fecha: "2026-07-31" });
    expect(localDayFormatter.format(range.to)).toBe("2026-08-01");
  });

  it('"custom" sin fecha cae a hoy sin lanzar (defensivo — Joi ya lo exige en la ruta)', () => {
    const range = resolveCurrentPeriod({ period: "custom" });
    expect(range.from.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("un period inválido cae a today (defensivo)", () => {
    const range = resolveCurrentPeriod({ period: "abc" });
    expect(range.preset).toBe("today");
  });
});
