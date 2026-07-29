import { describe, it, expect } from "vitest";
import { Currency, PriceRounding } from "@gira/shared";
import { convertFromMxn, applyRounding } from "../../src/utils/money.js";

// 1785 = 17.85 MXN por 1 USD. 100000 centavos = 1000.00 MXN.
describe("convertFromMxn", () => {
  it("devuelve el mismo entero cuando la moneda destino es MXN", () => {
    expect(convertFromMxn(100000, Currency.MXN, 1785, PriceRounding.NONE)).toBe(100000);
  });
  it("ignora el redondeo cuando la moneda destino es MXN", () => {
    expect(convertFromMxn(100000, Currency.MXN, 1785, PriceRounding.UP_TO_UNIT)).toBe(100000);
  });
  it("convierte a centavos de USD redondeando al centavo", () => {
    // 1000.00 / 17.85 = 56.0224... -> 5602
    expect(convertFromMxn(100000, Currency.USD, 1785, PriceRounding.NONE)).toBe(5602);
  });
  it("redondea hacia arriba al siguiente medio dólar", () => {
    expect(convertFromMxn(100000, Currency.USD, 1785, PriceRounding.UP_TO_50_CENTS)).toBe(5650);
  });
  it("redondea hacia arriba al siguiente dólar entero", () => {
    expect(convertFromMxn(100000, Currency.USD, 1785, PriceRounding.UP_TO_UNIT)).toBe(5700);
  });
  it("no mueve un valor que ya cae exacto en el escalón", () => {
    // 5600 centavos exactos: 56.00 ya es dólar entero
    expect(applyRounding(5600, PriceRounding.UP_TO_UNIT)).toBe(5600);
    expect(applyRounding(5650, PriceRounding.UP_TO_50_CENTS)).toBe(5650);
  });
  it("convierte 0 a 0 con cualquier redondeo", () => {
    expect(convertFromMxn(0, Currency.USD, 1785, PriceRounding.UP_TO_UNIT)).toBe(0);
  });
  it("lanza 500 con un tipo de cambio no positivo", () => {
    expect(() => convertFromMxn(100000, Currency.USD, 0, PriceRounding.NONE)).toThrow(
      expect.objectContaining({ statusCode: 500 }),
    );
  });
  it("siempre devuelve un entero", () => {
    for (const rate of [1731, 1799, 2003, 1666]) {
      const out = convertFromMxn(123456, Currency.USD, rate, PriceRounding.NONE);
      expect(Number.isInteger(out)).toBe(true);
    }
  });
});
