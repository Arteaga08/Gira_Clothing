import { describe, it, expect } from "vitest";
import { CouponDiscountType, Currency, PriceRounding } from "@gira/shared";
import { computeCouponDiscount } from "../../src/utils/couponDiscount.js";

const fx = { mxnPerUsdCents: 1800, rounding: PriceRounding.NONE };
const percent = (percentOff: number) => ({ discountType: CouponDiscountType.PERCENT, percentOff });
const fixed = (amountOffMxn: number) => ({ discountType: CouponDiscountType.FIXED, amountOffMxn });

describe("computeCouponDiscount", () => {
  it("porcentaje: redondea hacia abajo", () => {
    expect(computeCouponDiscount(percent(10), 12_345, Currency.MXN, fx)).toBe(1_234);
  });

  it("porcentaje 100 descuenta todo el subtotal", () => {
    expect(computeCouponDiscount(percent(100), 5_000, Currency.MXN, fx)).toBe(5_000);
  });

  it("monto fijo en MXN", () => {
    expect(computeCouponDiscount(fixed(15_000), 80_000, Currency.MXN, fx)).toBe(15_000);
  });

  it("monto fijo se convierte a USD con el tipo de cambio", () => {
    // $150.00 MXN at 18.00 MXN/USD = $8.33 USD (minor units: 833)
    expect(computeCouponDiscount(fixed(15_000), 10_000, Currency.USD, fx)).toBe(833);
  });

  it("nunca excede el subtotal", () => {
    expect(computeCouponDiscount(fixed(50_000), 20_000, Currency.MXN, fx)).toBe(20_000);
  });

  it("subtotal 0 da 0", () => {
    expect(computeCouponDiscount(percent(50), 0, Currency.MXN, fx)).toBe(0);
  });
});
