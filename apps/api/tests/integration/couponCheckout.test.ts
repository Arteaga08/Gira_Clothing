import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { CouponDiscountType, Currency, PriceRounding } from "@gira/shared";
import { Coupon } from "../../src/models/Coupon.js";
import { CouponRedemption } from "../../src/models/CouponRedemption.js";
import { Order } from "../../src/models/Order.js";
import { Variant } from "../../src/models/Variant.js";
import { releaseReservation, commitReservation } from "../../src/services/reservationService.js";
import { splitTax } from "../../src/utils/orderTax.js";
import { convertFromMxn } from "../../src/utils/money.js";
import { createCustomer, loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import {
  createOrderWithQuote,
  seedCatalogVariant,
  validCustomer,
  validShipping,
} from "../helpers/orders.js";

const app = (await import("../../src/app.js")).buildApp();

// seedCatalogVariant prices every unit at 10000 centavos ($100.00 MXN).
const UNIT = 10_000;

const makeCoupon = (overrides: Record<string, unknown> = {}) =>
  Coupon.create({
    code: "CHECKOUT10",
    name: "Cupón de checkout",
    discountType: CouponDiscountType.PERCENT,
    percentOff: 10,
    ...overrides,
  });

const seedVariant = async (suffix: string, onHand = 10): Promise<string> =>
  seedCatalogVariant(app, await loginAsAdmin(app), suffix, onHand);

const checkout = async (
  variantId: string,
  opts: { userId?: mongoose.Types.ObjectId; couponCode?: string; qty?: number; currency?: Currency } = {},
) =>
  createOrderWithQuote(
    {
      lines: [{ variantId, qty: opts.qty ?? 1 }],
      currency: opts.currency ?? Currency.MXN,
      customer: validCustomer,
      shipping: validShipping,
      idempotencyKey: randomUUID(),
      termsAccepted: true,
      ...(opts.couponCode ? { couponCode: opts.couponCode } : {}),
    },
    opts.userId ? { userId: opts.userId } : {},
  );

const newUser = async (): Promise<mongoose.Types.ObjectId> =>
  new mongoose.Types.ObjectId((await createCustomer()).id);

describe("checkout con cupón", () => {
  it("porcentaje: congela descuento, total, snapshot y canjea", async () => {
    const variantId = await seedVariant("A1");
    const coupon = await makeCoupon();
    const userId = await newUser();

    const created = await checkout(variantId, { userId, couponCode: "checkout10", qty: 2 });
    const order = (await Order.findOne({ publicId: created.order.publicId }))!;

    expect(order.subtotal).toBe(UNIT * 2);
    expect(order.discount).toBe(2_000);
    expect(order.total).toBe(order.subtotal - order.discount + order.shippingCost);
    expect(order.coupon).toMatchObject({ code: "CHECKOUT10", discountType: "percent", value: 10 });
    expect(String(order.couponId)).toBe(String(coupon._id));
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
    const redemption = await CouponRedemption.findOne({ order: order._id });
    expect(redemption).toMatchObject({ discount: 2_000 });
  });

  it("el IVA se deriva del total ya descontado", async () => {
    const variantId = await seedVariant("A2");
    await makeCoupon();
    const created = await checkout(variantId, { userId: await newUser(), couponCode: "CHECKOUT10" });
    const order = (await Order.findOne({ publicId: created.order.publicId }))!;
    expect(order.tax).toBe(splitTax(order.total, order.taxRateBps).tax);
  });

  it("monto fijo en USD: convierte y respeta el tope del subtotal", async () => {
    const variantId = await seedVariant("A3");
    await makeCoupon({
      code: "FIJO150",
      discountType: CouponDiscountType.FIXED,
      percentOff: undefined,
      amountOffMxn: 1_500,
    });
    const created = await checkout(variantId, {
      userId: await newUser(),
      couponCode: "FIJO150",
      currency: Currency.USD,
    });
    const order = (await Order.findOne({ publicId: created.order.publicId }))!;
    const expected = Math.min(
      order.subtotal,
      convertFromMxn(1_500, Currency.USD, order.exchangeRate, order.rounding as PriceRounding),
    );
    expect(order.discount).toBe(expected);
    expect(order.total).toBe(order.subtotal - order.discount + order.shippingCost);
  });

  it("invitado con cupón: 401 y no reserva ni crea nada", async () => {
    const variantId = await seedVariant("A4");
    await makeCoupon();
    await expect(checkout(variantId, { couponCode: "CHECKOUT10" })).rejects.toMatchObject({
      statusCode: 401,
      message: "Inicia sesión para usar un cupón.",
    });
    expect(await Order.countDocuments()).toBe(0);
    expect((await Variant.findById(variantId))!.reserved).toBe(0);
  });

  it("compra mínima no alcanzada: 409 sin reservar", async () => {
    const variantId = await seedVariant("A5");
    await makeCoupon({ minSubtotalMxn: 50_000 });
    await expect(
      checkout(variantId, { userId: await newUser(), couponCode: "CHECKOUT10" }),
    ).rejects.toMatchObject({ statusCode: 409, message: "Agrega $400.00 más para usar este cupón." });
    expect((await Variant.findById(variantId))!.reserved).toBe(0);
  });

  it("segundo pedido del mismo cliente con el mismo cupón: 409", async () => {
    const variantId = await seedVariant("A6");
    await makeCoupon();
    const userId = await newUser();
    await checkout(variantId, { userId, couponCode: "CHECKOUT10" });
    await expect(checkout(variantId, { userId, couponCode: "CHECKOUT10" })).rejects.toMatchObject({
      statusCode: 409,
      message: "Ya usaste este cupón.",
    });
  });

  it("dos clientes disputan el último lugar: uno gana y el otro libera su reserva", async () => {
    const variantId = await seedVariant("A7");
    const coupon = await makeCoupon({ maxRedemptions: 1 });
    const results = await Promise.allSettled([
      checkout(variantId, { userId: await newUser(), couponCode: "CHECKOUT10" }),
      checkout(variantId, { userId: await newUser(), couponCode: "CHECKOUT10" }),
    ]);
    const winners = results.filter((r) => r.status === "fulfilled");
    expect(winners).toHaveLength(1);
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
    expect(await CouponRedemption.countDocuments({ coupon: coupon._id })).toBe(1);
    // The loser held stock for a moment and gave it back.
    expect((await Variant.findById(variantId))!.reserved).toBe(1);
  });

  it("liberar la reserva de un pedido sin pagar devuelve el cupón", async () => {
    const variantId = await seedVariant("A8");
    const coupon = await makeCoupon();
    const userId = await newUser();
    const created = await checkout(variantId, { userId, couponCode: "CHECKOUT10" });
    const order = (await Order.findOne({ publicId: created.order.publicId }))!;

    expect(await releaseReservation(order._id, "expired")).toBe(true);
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(0);
    expect(await CouponRedemption.countDocuments({ order: order._id })).toBe(0);
    // And the customer can use it again.
    await expect(checkout(variantId, { userId, couponCode: "CHECKOUT10" })).resolves.toBeDefined();
  });

  it("un pedido pagado conserva el canje aunque luego se reembolse", async () => {
    const variantId = await seedVariant("A9");
    const coupon = await makeCoupon();
    const created = await checkout(variantId, { userId: await newUser(), couponCode: "CHECKOUT10" });
    const order = (await Order.findOne({ publicId: created.order.publicId }))!;

    expect(await commitReservation(order._id)).toBe(true);
    expect(await releaseReservation(order._id, "refunded")).toBe(false);
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
  });

  it("reintentar con la misma idempotencyKey no vuelve a canjear", async () => {
    const variantId = await seedVariant("B1");
    const coupon = await makeCoupon();
    const userId = await newUser();
    const key = randomUUID();
    const input = {
      lines: [{ variantId, qty: 1 }],
      currency: Currency.MXN,
      customer: validCustomer,
      shipping: validShipping,
      idempotencyKey: key,
      termsAccepted: true,
      couponCode: "CHECKOUT10",
    };
    await createOrderWithQuote(input, { userId });
    await createOrderWithQuote(input, { userId });
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
  });
});

describe("POST /orders · validación del código", () => {
  it("un código con formato inválido responde 400 con el mensaje genérico", async () => {
    const res = await request(app)
      .post("/api/v1/orders")
      .set("Origin", ORIGIN)
      .send({
        lines: [{ variantId: new mongoose.Types.ObjectId().toString(), qty: 1 }],
        customer: validCustomer,
        shipping: validShipping,
        shippingQuote: { quoteId: "x".repeat(12), rateId: "y".repeat(12) },
        termsAccepted: true,
        couponCode: "no valido!",
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("El cupón no es válido.");
  });
});
