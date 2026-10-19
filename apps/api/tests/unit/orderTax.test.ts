import { describe, it, expect } from "vitest";
import { splitTax } from "../../src/utils/orderTax.js";

describe("splitTax (precios con IVA incluido)", () => {
  it("16% de un total redondo: 11600 -> neto 10000, iva 1600", () => {
    expect(splitTax(11600, 1600)).toEqual({ net: 10000, tax: 1600 });
  });

  it("neto + iva suma exactamente el total (el iva se obtiene por resta)", () => {
    for (const total of [1, 99, 12345, 99999, 123457]) {
      const { net, tax } = splitTax(total, 1600);
      expect(net + tax).toBe(total);
    }
  });

  it("tasa 0 -> sin iva", () => {
    expect(splitTax(5000, 0)).toEqual({ net: 5000, tax: 0 });
  });

  it("total 0 -> todo en cero", () => {
    expect(splitTax(0, 1600)).toEqual({ net: 0, tax: 0 });
  });

  it("un total en 0 (descuento que lo cubre todo) no produce neto negativo", () => {
    expect(splitTax(Math.max(0, 5000 - 9000), 1600)).toEqual({ net: 0, tax: 0 });
  });

  it("rechaza tasas fuera de rango o no enteras", () => {
    expect(() => splitTax(100, -1)).toThrow();
    expect(() => splitTax(100, 10_001)).toThrow();
    expect(() => splitTax(100, 16.5)).toThrow();
  });
});
