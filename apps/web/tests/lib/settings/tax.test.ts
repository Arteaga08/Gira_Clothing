import { describe, expect, it } from "vitest";
import { bpsToPercentInput, formatTaxRate, parseTaxPercent } from "@/lib/settings/tax";

describe("parseTaxPercent", () => {
  it("convierte el porcentaje a puntos base", () => {
    expect(parseTaxPercent("16")).toEqual({ rateBps: 1600 });
    expect(parseTaxPercent(" 8 ")).toEqual({ rateBps: 800 });
    expect(parseTaxPercent("0")).toEqual({ rateBps: 0 });
    expect(parseTaxPercent("100")).toEqual({ rateBps: 10000 });
    expect(parseTaxPercent("10.5")).toEqual({ rateBps: 1050 });
    expect(parseTaxPercent("10,25")).toEqual({ rateBps: 1025 });
  });

  it("rechaza vacío, texto, negativos, más de 100 y más de dos decimales", () => {
    expect(parseTaxPercent("")).toEqual({ error: "Escribe la tasa de IVA." });
    for (const bad of ["abc", "-1", "16%", "1e2"]) {
      expect(parseTaxPercent(bad)).toEqual({ error: "Escribe un porcentaje como 16 o 8.5." });
    }
    expect(parseTaxPercent("100.01")).toEqual({ error: "La tasa no puede superar el 100 %." });
    expect(parseTaxPercent("16.125")).toEqual({ error: "Usa como máximo dos decimales." });
  });
});

describe("formato", () => {
  it("muestra la tasa sin ceros sobrantes", () => {
    expect(formatTaxRate(1600)).toBe("16 %");
    expect(formatTaxRate(1050)).toBe("10.5 %");
    expect(formatTaxRate(1025)).toBe("10.25 %");
    expect(bpsToPercentInput(1600)).toBe("16");
    expect(bpsToPercentInput(850)).toBe("8.5");
  });
});
