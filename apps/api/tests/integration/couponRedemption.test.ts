import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { CouponDiscountType } from "@gira/shared";
import { Coupon } from "../../src/models/Coupon.js";
import { CouponRedemption } from "../../src/models/CouponRedemption.js";
import type { AppError } from "../../src/utils/AppError.js";
import {
  resolveCouponForCheckout,
  assertMeetsMinimum,
} from "../../src/services/couponRulesService.js";
import {
  claimCoupon,
  releaseCouponForOrder,
} from "../../src/services/couponRedemptionService.js";

const makeCoupon = (overrides: Record<string, unknown> = {}) =>
  Coupon.create({
    code: "TESTCODE",
    name: "Cupón de prueba",
    discountType: CouponDiscountType.PERCENT,
    percentOff: 10,
    ...overrides,
  });

describe("Coupon · modelo", () => {
  it("guarda el código en mayúsculas y rechaza duplicados", async () => {
    await Coupon.syncIndexes();
    await makeCoupon({ code: "verano10" });
    await expect(makeCoupon({ code: "VERANO10" })).rejects.toMatchObject({ code: 11000 });
  });

  it("rechaza un porcentaje sin percentOff", async () => {
    await expect(makeCoupon({ percentOff: undefined })).rejects.toThrow();
  });

  it("CouponRedemption: un solo canje por cliente y cupón", async () => {
    await CouponRedemption.syncIndexes();
    const coupon = await makeCoupon();
    const user = new mongoose.Types.ObjectId();
    const base = { coupon: coupon._id, user, discount: 100 };
    await CouponRedemption.create({ ...base, order: new mongoose.Types.ObjectId() });
    await expect(
      CouponRedemption.create({ ...base, order: new mongoose.Types.ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

const userId = () => new mongoose.Types.ObjectId();
const DAY = 86_400_000;

describe("couponRulesService.resolveCouponForCheckout", () => {
  it("invitado: 401 con mensaje de sesión", async () => {
    await makeCoupon({ code: "SOLOCUENTA" });
    await expect(resolveCouponForCheckout("solocuenta", undefined)).rejects.toMatchObject({
      statusCode: 401,
      message: "Inicia sesión para usar un cupón.",
    });
  });

  it("código inexistente, retirado y no iniciado dan el MISMO mensaje", async () => {
    await makeCoupon({ code: "RETIRADO1", isActive: false });
    await makeCoupon({ code: "FUTURO001", startsAt: new Date(Date.now() + DAY) });
    const messages = await Promise.all(
      ["NOEXISTE1", "RETIRADO1", "FUTURO001"].map((c) =>
        resolveCouponForCheckout(c, userId()).catch((e: AppError) => e.message),
      ),
    );
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe("El cupón no es válido.");
  });

  it("vencido: 409", async () => {
    await makeCoupon({ code: "VENCIDO01", endsAt: new Date(Date.now() - DAY) });
    await expect(resolveCouponForCheckout("VENCIDO01", userId())).rejects.toMatchObject({
      statusCode: 409,
      message: "El cupón ya venció.",
    });
  });

  it("agotado: 409", async () => {
    await makeCoupon({ code: "AGOTADO01", maxRedemptions: 1, redeemedCount: 1 });
    await expect(resolveCouponForCheckout("AGOTADO01", userId())).rejects.toMatchObject({
      statusCode: 409,
      message: "El cupón ya alcanzó su límite de usos.",
    });
  });

  it("ya usado por el cliente: 409", async () => {
    const coupon = await makeCoupon({ code: "USADO0001" });
    const user = userId();
    await CouponRedemption.create({ coupon: coupon._id, user, order: userId(), discount: 1 });
    await expect(resolveCouponForCheckout("USADO0001", user)).rejects.toMatchObject({
      statusCode: 409,
      message: "Ya usaste este cupón.",
    });
  });

  it("devuelve el cupón normalizando mayúsculas y espacios", async () => {
    await makeCoupon({ code: "BUENO0001" });
    const coupon = await resolveCouponForCheckout("  bueno0001 ", userId());
    expect(coupon.code).toBe("BUENO0001");
  });
});

describe("couponRulesService.assertMeetsMinimum", () => {
  it("dice cuánto falta", () => {
    expect(() => assertMeetsMinimum({ minSubtotalMxn: 79_900 }, 50_000)).toThrow(
      "Agrega $299.00 más para usar este cupón.",
    );
  });

  it("pasa con mínimo 0 o alcanzado", () => {
    expect(() => assertMeetsMinimum({ minSubtotalMxn: 0 }, 1)).not.toThrow();
    expect(() => assertMeetsMinimum({ minSubtotalMxn: 5_000 }, 5_000)).not.toThrow();
  });
});

describe("couponRedemptionService", () => {
  it("canje: incrementa el contador y crea la redención", async () => {
    const coupon = await makeCoupon({ code: "CANJE0001", maxRedemptions: 5 });
    await claimCoupon({ couponId: coupon._id, userId: userId(), orderId: userId(), discount: 500 });
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
    expect(await CouponRedemption.countDocuments({ coupon: coupon._id })).toBe(1);
  });

  it("tope: con 1 lugar y 5 canjes simultáneos solo uno gana", async () => {
    const coupon = await makeCoupon({ code: "CARRERA01", maxRedemptions: 1 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        claimCoupon({ couponId: coupon._id, userId: userId(), orderId: userId(), discount: 100 }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
    expect(await CouponRedemption.countDocuments({ coupon: coupon._id })).toBe(1);
  });

  it("un cliente con dos pedidos simultáneos canjea una vez y no deja contador de más", async () => {
    const coupon = await makeCoupon({ code: "UNO000001", maxRedemptions: 10 });
    const user = userId();
    const results = await Promise.allSettled([
      claimCoupon({ couponId: coupon._id, userId: user, orderId: userId(), discount: 100 }),
      claimCoupon({ couponId: coupon._id, userId: user, orderId: userId(), discount: 100 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
  });

  it("liberar: devuelve el lugar y es idempotente", async () => {
    const coupon = await makeCoupon({ code: "LIBERA001", maxRedemptions: 1 });
    const orderId = userId();
    await claimCoupon({ couponId: coupon._id, userId: userId(), orderId, discount: 100 });
    expect(await releaseCouponForOrder(orderId)).toBe(true);
    expect(await releaseCouponForOrder(orderId)).toBe(false);
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(0);
  });
});
