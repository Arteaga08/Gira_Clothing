import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { CouponDiscountType, Currency, OrderStatus, ReservationStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Coupon } from "../../src/models/Coupon.js";
import { CouponRedemption } from "../../src/models/CouponRedemption.js";
import { Order } from "../../src/models/Order.js";
import { Settings, SINGLETON_KEY } from "../../src/models/Settings.js";
import { StockReservation } from "../../src/models/StockReservation.js";
import { Variant } from "../../src/models/Variant.js";
import { createOrder } from "../../src/services/orderService.js";
import { createShippingQuote } from "../../src/services/shippingQuoteService.js";
import {
  createCustomer,
  loginAsAdmin,
  loginCustomer,
  ORIGIN,
} from "../helpers/auth.js";
import {
  quoteRateFor,
  seedCatalogVariant,
  seedShippingOrigin,
  validShipping,
} from "../helpers/orders.js";

const app = buildApp();
const ORDERS = "/api/v1/orders";

interface Shopper {
  id: string;
  email: string;
  cookie: string;
}

const newShopper = async (): Promise<Shopper> => {
  const customer = await createCustomer();
  return { id: customer.id, email: customer.email, cookie: await loginCustomer(app, customer) };
};

const putInCart = (shopper: Shopper, variantId: string, qty = 1) =>
  request(app)
    .put(`/api/v1/cart/lines/${variantId}`)
    .set("Origin", ORIGIN)
    .set("Cookie", shopper.cookie)
    .send({ qty });

/** Quote for the shopper's own cart, bound to their account (as the storefront does it). */
const quoteCart = async (shopper: Shopper) => {
  await seedShippingOrigin();
  const res = await request(app)
    .post("/api/v1/shipping/quotes")
    .set("Origin", ORIGIN)
    .set("Cookie", shopper.cookie)
    .send({
      useCart: true,
      destination: {
        postalCode: validShipping.postalCode,
        state: validShipping.state,
        city: validShipping.city,
      },
    });
  const quote = res.body.data.quote as { quoteId: string; rates: { rateId: string }[] };
  return { quoteId: quote.quoteId, rateId: quote.rates[0]!.rateId };
};

const checkoutBody = (shippingQuote: { quoteId: string; rateId: string }, extra: Record<string, unknown> = {}) => ({
  useCart: true,
  customer: { phone: "5512345678" },
  shipping: validShipping,
  shippingQuote,
  termsAccepted: true,
  ...extra,
});

const postOrder = (shopper: Shopper, body: Record<string, unknown>, key = randomUUID()) =>
  request(app)
    .post(ORDERS)
    .set("Origin", ORIGIN)
    .set("Cookie", shopper.cookie)
    .set("Idempotency-Key", key)
    .send(body);

const seedVariant = async (suffix: string, onHand = 10): Promise<string> =>
  seedCatalogVariant(app, await loginAsAdmin(app), suffix, onHand);

/** A shopper with one unit in the cart and a pending order for it. */
const pendingOrderFor = async (suffix: string) => {
  const variantId = await seedVariant(suffix);
  const shopper = await newShopper();
  await putInCart(shopper, variantId);
  const res = await postOrder(shopper, checkoutBody(await quoteCart(shopper)));
  expect(res.status).toBe(201);
  const order = await Order.findOne({ publicId: res.body.data.order.publicId }).lean();
  return { shopper, variantId, order: order! };
};

const freeShipping = () =>
  Settings.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $set: { "shipping.freeShippingThreshold": 0 }, $setOnInsert: { key: SINGLETON_KEY } },
    { upsert: true, setDefaultsOnInsert: true },
  );

describe("POST /orders · solo con sesión de cliente", () => {
  it("anónimo responde 401", async () => {
    const res = await request(app)
      .post(ORDERS)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({});
    expect(res.status).toBe(401);
  });

  it("un admin responde 403", async () => {
    const adminCookie = await loginAsAdmin(app);
    const res = await request(app)
      .post(ORDERS)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .set("Idempotency-Key", randomUUID())
      .send({});
    expect(res.status).toBe(403);
  });

  it("el correo y el nombre salen de la cuenta, no del body", async () => {
    const variantId = await seedVariant("M16A");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);
    const res = await postOrder(
      shopper,
      checkoutBody(await quoteCart(shopper), {
        customer: { email: "otra@example.com", name: "Otra Persona", phone: "5512345678" },
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.order.customer).toEqual({
      email: shopper.email,
      name: "Cliente Prueba",
      phone: "5512345678",
    });
  });

  it("sin correo verificado responde 403 y no aparta stock", async () => {
    const variantId = await seedVariant("M16B");
    const customer = await createCustomer({ emailVerified: false });
    const userId = new mongoose.Types.ObjectId(customer.id);

    await expect(
      createOrder(
        {
          lines: [{ variantId, qty: 1 }],
          currency: Currency.MXN,
          customer: { phone: "5512345678" },
          shipping: validShipping,
          idempotencyKey: randomUUID(),
          termsAccepted: true,
          shippingQuote: await quoteRateFor(variantId, 1, Currency.MXN, userId),
        },
        { userId },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((await Variant.findById(variantId).lean())!.reserved).toBe(0);
  });

  it("una cotización hecha sin cuenta no sirve para pagar (409)", async () => {
    const variantId = await seedVariant("M16C");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);
    await seedShippingOrigin();
    const guestQuote = await createShippingQuote(
      {
        lines: [{ variantId, qty: 1 }],
        currency: Currency.MXN,
        destination: { postalCode: validShipping.postalCode, state: validShipping.state, city: validShipping.city },
      },
      {},
    );
    const res = await postOrder(
      shopper,
      checkoutBody({ quoteId: guestQuote.quoteId, rateId: guestQuote.rates[0]!.rateId }),
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /orders · mínimo de cobro ($10)", () => {
  it("cupón de 100 % con envío gratis (total 0) responde 409 sin apartar stock ni canjear", async () => {
    await freeShipping();
    const coupon = await Coupon.create({
      code: "GRATIS100",
      name: "Todo gratis",
      discountType: CouponDiscountType.PERCENT,
      percentOff: 100,
    });
    const variantId = await seedVariant("M16D");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);

    const res = await postOrder(shopper, checkoutBody(await quoteCart(shopper), { couponCode: "GRATIS100" }));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      "Con este cupón tu pedido queda en menos de $10 y no se puede pagar con tarjeta.",
    );
    expect(await Order.countDocuments({ user: shopper.id })).toBe(0);
    expect(await CouponRedemption.countDocuments({ coupon: coupon._id })).toBe(0);
    expect((await Variant.findById(variantId).lean())!.reserved).toBe(0);
  });

  it("un total de $5 también responde 409", async () => {
    await freeShipping();
    // $100.00 de producto menos $95.00 de cupón = $5.00.
    await Coupon.create({
      code: "CASI100",
      name: "Casi todo",
      discountType: CouponDiscountType.FIXED,
      amountOffMxn: 9500,
    });
    const variantId = await seedVariant("M16E");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);

    const res = await postOrder(shopper, checkoutBody(await quoteCart(shopper), { couponCode: "CASI100" }));
    expect(res.status).toBe(409);
  });

  it("justo $10 sí se puede pagar", async () => {
    await freeShipping();
    await Coupon.create({
      code: "JUSTO10",
      name: "Justo diez",
      discountType: CouponDiscountType.FIXED,
      amountOffMxn: 9000,
    });
    const variantId = await seedVariant("M16F");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);

    const res = await postOrder(shopper, checkoutBody(await quoteCart(shopper), { couponCode: "JUSTO10" }));
    expect(res.status).toBe(201);
    expect(res.body.data.order.total).toBe(1000);
  });
});

describe("POST /orders · un solo pedido por pagar por cliente", () => {
  it("un segundo checkout con otra clave responde 409 y no aparta más stock", async () => {
    const { shopper, variantId } = await pendingOrderFor("M16G");
    const res = await postOrder(shopper, checkoutBody(await quoteCart(shopper)));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Ya tienes un pedido por pagar. Págalo o cancélalo para hacer otro.");
    expect(await Order.countDocuments({ user: shopper.id, status: OrderStatus.PENDING_PAYMENT })).toBe(1);
    expect((await Variant.findById(variantId).lean())!.reserved).toBe(1);
  });

  it("si dos checkouts se cruzan, el índice único rechaza al segundo y le devuelve stock y cupón", async () => {
    const coupon = await Coupon.create({
      code: "CARRERA10",
      name: "Carrera",
      discountType: CouponDiscountType.PERCENT,
      percentOff: 10,
    });
    const { shopper, variantId } = await pendingOrderFor("M16V");
    // Simula la carrera: el chequeo temprano no ve el pedido que ya existe.
    const spy = vi.spyOn(Order, "exists").mockResolvedValue(null);
    try {
      const res = await postOrder(shopper, checkoutBody(await quoteCart(shopper), { couponCode: "CARRERA10" }));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("Ya tienes un pedido por pagar. Págalo o cancélalo para hacer otro.");
    } finally {
      spy.mockRestore();
    }
    expect((await Variant.findById(variantId).lean())!.reserved).toBe(1);
    expect((await Coupon.findById(coupon._id).lean())!.redeemedCount).toBe(0);
    expect(await CouponRedemption.countDocuments({ coupon: coupon._id })).toBe(0);
    expect(await Order.countDocuments({ user: shopper.id })).toBe(1);
  });

  it("repetir la misma clave devuelve el mismo pedido (no choca consigo mismo)", async () => {
    const variantId = await seedVariant("M16H");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);
    const body = checkoutBody(await quoteCart(shopper));
    const key = randomUUID();
    const first = await postOrder(shopper, body, key);
    const second = await postOrder(shopper, body, key);
    expect(second.status).toBe(201);
    expect(second.body.data.order.publicId).toBe(first.body.data.order.publicId);
  });

  it("otro cliente con su propio pendiente no se ve afectado", async () => {
    const first = await pendingOrderFor("M16I");
    const second = await pendingOrderFor("M16J");
    expect(String(first.order.user)).not.toBe(String(second.order.user));
    expect(second.order.status).toBe(OrderStatus.PENDING_PAYMENT);
  });
});

describe("POST /orders/preview", () => {
  it("anónimo responde 401", async () => {
    const res = await request(app).post(`${ORDERS}/preview`).set("Origin", ORIGIN).send({});
    expect(res.status).toBe(401);
  });

  it("sin envío elegido devuelve subtotal y total sin envío", async () => {
    const variantId = await seedVariant("M16K");
    const shopper = await newShopper();
    await putInCart(shopper, variantId, 2);
    const res = await request(app)
      .post(`${ORDERS}/preview`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({
      currency: "MXN",
      subtotal: 20000,
      discount: 0,
      shippingCost: 0,
      total: 20000,
      coupon: null,
    });
  });

  it("con cupón y envío calcula lo mismo que cobrará la orden, sin canjear ni apartar", async () => {
    await Coupon.create({
      code: "PREVIEW10",
      name: "Diez",
      discountType: CouponDiscountType.PERCENT,
      percentOff: 10,
    });
    const variantId = await seedVariant("M16L");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);
    const shippingQuote = await quoteCart(shopper);

    const preview = await request(app)
      .post(`${ORDERS}/preview`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie)
      .send({ couponCode: "preview10", shippingQuote, postalCode: validShipping.postalCode });
    expect(preview.status).toBe(200);
    const summary = preview.body.data.summary;
    expect(summary.discount).toBe(1000);
    expect(summary.coupon).toEqual({ code: "PREVIEW10", discountType: "percent", value: 10 });
    expect((await Variant.findById(variantId).lean())!.reserved).toBe(0);
    expect(await CouponRedemption.countDocuments({ user: shopper.id })).toBe(0);

    const order = await postOrder(shopper, checkoutBody(shippingQuote, { couponCode: "PREVIEW10" }));
    expect(order.body.data.order.total).toBe(summary.total);
  });

  it("un cupón inválido responde con el mismo error que el checkout", async () => {
    const variantId = await seedVariant("M16M");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);
    const res = await request(app)
      .post(`${ORDERS}/preview`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie)
      .send({ couponCode: "NOEXISTE" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("El cupón no es válido.");
  });

  it("el mínimo de $10 también sale en la vista previa", async () => {
    await freeShipping();
    await Coupon.create({
      code: "PREV100",
      name: "Todo",
      discountType: CouponDiscountType.PERCENT,
      percentOff: 100,
    });
    const variantId = await seedVariant("M16N");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);
    const res = await request(app)
      .post(`${ORDERS}/preview`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie)
      .send({ couponCode: "PREV100", shippingQuote: await quoteCart(shopper), postalCode: validShipping.postalCode });
    expect(res.status).toBe(409);
  });

  it("carrito vacío responde 400", async () => {
    const shopper = await newShopper();
    const res = await request(app)
      .post(`${ORDERS}/preview`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /orders/mine/:id/payment", () => {
  it("devuelve el clientSecret del mismo intent para reanudar el pago", async () => {
    const { shopper, order } = await pendingOrderFor("M16O");
    const res = await request(app)
      .post(`${ORDERS}/mine/${String(order._id)}/payment`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.clientSecret).toBe(`${order.payment.intentId}_secret_stub`);
    expect(res.body.data.order.id).toBe(String(order._id));
  });

  it("el pedido de otro cliente responde 404", async () => {
    const { order } = await pendingOrderFor("M16P");
    const stranger = await newShopper();
    const res = await request(app)
      .post(`${ORDERS}/mine/${String(order._id)}/payment`)
      .set("Origin", ORIGIN)
      .set("Cookie", stranger.cookie);
    expect(res.status).toBe(404);
  });

  it("un pedido que ya no está por pagar responde 409", async () => {
    const { shopper, order } = await pendingOrderFor("M16Q");
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID } });
    const res = await request(app)
      .post(`${ORDERS}/mine/${String(order._id)}/payment`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie);
    expect(res.status).toBe(409);
  });
});

describe("POST /orders/mine/:id/cancel", () => {
  it("cancela, libera el stock y devuelve el cupón", async () => {
    const coupon = await Coupon.create({
      code: "CANCELA10",
      name: "Diez",
      discountType: CouponDiscountType.PERCENT,
      percentOff: 10,
    });
    const variantId = await seedVariant("M16R");
    const shopper = await newShopper();
    await putInCart(shopper, variantId);
    const created = await postOrder(shopper, checkoutBody(await quoteCart(shopper), { couponCode: "CANCELA10" }));
    const order = await Order.findOne({ publicId: created.body.data.order.publicId }).lean();
    expect((await Coupon.findById(coupon._id).lean())!.redeemedCount).toBe(1);

    const res = await request(app)
      .post(`${ORDERS}/mine/${String(order!._id)}/cancel`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe(OrderStatus.CANCELLED);
    expect((await Variant.findById(variantId).lean())!.reserved).toBe(0);
    expect((await StockReservation.findOne({ order: order!._id }).lean())!.status).toBe(
      ReservationStatus.RELEASED,
    );
    expect((await Coupon.findById(coupon._id).lean())!.redeemedCount).toBe(0);

    // Ya puede volver a comprar.
    const again = await postOrder(shopper, checkoutBody(await quoteCart(shopper)));
    expect(again.status).toBe(201);
  });

  it("el pedido de otro cliente responde 404", async () => {
    const { order } = await pendingOrderFor("M16S");
    const stranger = await newShopper();
    const res = await request(app)
      .post(`${ORDERS}/mine/${String(order._id)}/cancel`)
      .set("Origin", ORIGIN)
      .set("Cookie", stranger.cookie);
    expect(res.status).toBe(404);
  });

  it("un pedido ya pagado responde 409", async () => {
    const { shopper, order } = await pendingOrderFor("M16T");
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID } });
    const res = await request(app)
      .post(`${ORDERS}/mine/${String(order._id)}/cancel`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie);
    expect(res.status).toBe(409);
  });
});

describe("GET /orders/mine?status=", () => {
  it("filtra por estado (el checkout busca su pedido por pagar)", async () => {
    const { shopper, order } = await pendingOrderFor("M16U");
    const pending = await request(app)
      .get(`${ORDERS}/mine?status=pending_payment`)
      .set("Cookie", shopper.cookie);
    expect(pending.status).toBe(200);
    expect(pending.body.data.orders.map((o: { id: string }) => o.id)).toEqual([String(order._id)]);

    const paid = await request(app).get(`${ORDERS}/mine?status=paid`).set("Cookie", shopper.cookie);
    expect(paid.body.data.orders).toEqual([]);
  });

  it("un estado desconocido responde 400", async () => {
    const shopper = await newShopper();
    const res = await request(app).get(`${ORDERS}/mine?status=lo-que-sea`).set("Cookie", shopper.cookie);
    expect(res.status).toBe(400);
  });
});
