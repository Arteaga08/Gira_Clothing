import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Currency, OrderStatus, PaymentStatus } from "@gira/shared";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const { mockCreate, mockRetrieve, mockRefundCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockRetrieve: vi.fn(),
  mockRefundCreate: vi.fn(),
}));

// Same pattern as tests/unit/paymentAdapter.test.ts: paymentIntents/refunds are
// mocked (no network); `webhooks` delegates to the REAL Stripe SDK so signature
// verification is tested with real crypto, not a hand-rolled fake.
vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  class MockStripe {
    paymentIntents = { create: mockCreate, retrieve: mockRetrieve };
    refunds = { create: mockRefundCreate };
    webhooks: InstanceType<typeof actual.default>["webhooks"];
    constructor(key: string) {
      this.webhooks = new actual.default(key).webhooks;
    }
  }
  return { default: MockStripe };
});

const STRIPE_TEST_CONFIG = {
  secretKey: "sk_test_fake",
  webhookSecret: "whsec_fake",
  webhookToleranceSeconds: 300,
};

// Force getPaymentProvider() to build the REAL Stripe adapter (SDK network
// calls mocked above) instead of the env-driven stub — the webhook route must
// exercise Stripe's actual signature verification, which the stub doesn't have.
vi.mock("../../src/adapters/payment/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/adapters/payment/index.js")>();
  const { createStripePaymentProvider } = await import(
    "../../src/adapters/payment/stripePaymentProvider.js"
  );
  const provider = createStripePaymentProvider(STRIPE_TEST_CONFIG);
  return { ...actual, getPaymentProvider: () => provider };
});

let intentCounter = 0;
mockCreate.mockImplementation(() =>
  Promise.resolve({
    id: `pi_test_${(intentCounter += 1)}`,
    status: "requires_payment_method",
    amount: 1,
    currency: "mxn",
    client_secret: "secret_stub",
  }),
);

const { buildApp } = await import("../../src/app.js");
const { createOrder } = await import("../../src/services/orderService.js");
const { Order } = await import("../../src/models/Order.js");
const { Variant } = await import("../../src/models/Variant.js");
const { WebhookEvent } = await import("../../src/models/WebhookEvent.js");
const RealStripe = (await import("stripe")).default;

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

const validShipping = {
  recipient: "Ana Pérez",
  line1: "Calle Falsa 123",
  city: "CDMX",
  state: "CDMX",
  postalCode: "01000",
  country: "MX",
};
const validCustomer = { email: "cliente@example.com", name: "Ana Pérez" };
const uniqueKey = (): string => `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const seedVariant = async (adminCookie: string, suffix: string, onHand = 10): Promise<string> => {
  const familyRes = await request(app)
    .post(FAMILIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Familia ${suffix}` });
  const familyId = familyRes.body.data.family.id as string;

  const printRes = await request(app)
    .post(PRINTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Print ${suffix}`, sku: `SKU-${suffix}`, family: familyId, image: validImage });
  const printId = printRes.body.data.print.id as string;

  const categoryRes = await request(app)
    .post(CATEGORIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Categoría ${suffix}` });
  const categoryId = categoryRes.body.data.category.id as string;

  const productRes = await request(app)
    .post(PRODUCTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 10000 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ product: productId, print: printId, images: [validImage] });
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne({ _id: variantId }, { $set: { onHand } });
  return variantId;
};

/** Creates a real pending_payment order (with an active reservation) via the real service. */
const seedOrder = async (adminCookie: string, suffix: string, qty = 2, onHand = 10) => {
  const variantId = await seedVariant(adminCookie, suffix, onHand);
  const result = await createOrder(
    {
      lines: [{ variantId, qty }],
      currency: Currency.MXN,
      customer: validCustomer,
      shipping: validShipping,
      idempotencyKey: uniqueKey(),
    },
    {},
  );
  const order = await Order.findOne({ publicId: result.order.publicId });
  return { order: order!, variantId, qty };
};

const sign = (payload: string, timestamp?: number): string =>
  new RealStripe(STRIPE_TEST_CONFIG.secretKey).webhooks.generateTestHeaderString({
    payload,
    secret: STRIPE_TEST_CONFIG.webhookSecret,
    ...(timestamp !== undefined ? { timestamp } : {}),
  });

const postWebhook = (payload: string, signature: string) =>
  request(app)
    .post("/api/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);

const succeededPayload = (eventId: string, order: { _id: unknown; payment: { intentId?: string } }) =>
  JSON.stringify({
    id: eventId,
    type: "payment_intent.succeeded",
    data: {
      object: { id: order.payment.intentId, metadata: { orderId: String(order._id) } },
    },
  });

describe("Stripe webhook · firma y seguridad", () => {
  it("firma inválida responde 400, sin WebhookEvent ni efectos", async () => {
    const payload = JSON.stringify({ id: "evt_bad", type: "payment_intent.succeeded", data: { object: {} } });
    const res = await postWebhook(payload, "t=1700000000,v1=deadbeef");
    expect(res.status).toBe(400);
    expect(await WebhookEvent.countDocuments({})).toBe(0);
  });

  it("timestamp fuera de tolerancia (replay) responde 400", async () => {
    const payload = JSON.stringify({ id: "evt_old", type: "payment_intent.succeeded", data: { object: {} } });
    const old = Math.floor(Date.now() / 1000) - 3600;
    const res = await postWebhook(payload, sign(payload, old));
    expect(res.status).toBe(400);
    expect(await WebhookEvent.countDocuments({})).toBe(0);
  });

  it("body alterado tras firmar responde 400", async () => {
    const payload = JSON.stringify({ id: "evt_x", type: "payment_intent.succeeded", data: { object: {} } });
    const signature = sign(payload);
    const tampered = payload.replace("evt_x", "evt_HACKED");
    const res = await postWebhook(tampered, signature);
    expect(res.status).toBe(400);
  });

  it("el body llega crudo: una clave $set sobrevive intacta a la firma (mongoSanitize no corrió)", async () => {
    const payload = JSON.stringify({
      id: "evt_raw",
      type: "customer.created",
      data: { object: { id: "cus_1", weird: { $set: { hacked: true } } } },
    });
    const res = await postWebhook(payload, sign(payload));
    expect(res.status).toBe(200);
    const stored = await WebhookEvent.findOne({ eventId: "evt_raw" }).lean();
    expect(stored?.status).toBe("ignored");
  });
});

describe("Stripe webhook · payment_intent.succeeded", () => {
  it("sobre orden pending_payment: paga, comete la reserva y descuenta stock", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId, qty } = await seedOrder(adminCookie, "S1", 2, 10);

    const payload = succeededPayload("evt_s1", order);
    const res = await postWebhook(payload, sign(payload));

    expect(res.status).toBe(200);
    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PAID);
    expect(updated?.paidAt).toBeDefined();

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(10 - qty);
    expect(variant?.reserved).toBe(0);
  });

  it("el mismo event.id entregado dos veces: la segunda no vuelve a descontar", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId, qty } = await seedOrder(adminCookie, "S2", 3, 10);
    const payload = succeededPayload("evt_s2", order);
    const signature = sign(payload);

    await postWebhook(payload, signature);
    const second = await postWebhook(payload, signature);

    expect(second.status).toBe(200);
    expect(await WebhookEvent.countDocuments({ eventId: "evt_s2" })).toBe(1);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(10 - qty);
  });

  it("dos entregas concurrentes del mismo event.id: exactamente una procesa", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId, qty } = await seedOrder(adminCookie, "S3", 2, 10);
    const payload = succeededPayload("evt_s3", order);
    const signature = sign(payload);

    await Promise.all([postWebhook(payload, signature), postWebhook(payload, signature)]);

    expect(await WebhookEvent.countDocuments({ eventId: "evt_s3" })).toBe(1);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(10 - qty);
  });

  it("sobre una orden ya paid: no-op, stock sin cambios", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "S4", 1, 10);
    await postWebhook(succeededPayload("evt_s4a", order), sign(succeededPayload("evt_s4a", order)));

    const variantAfterFirst = await Variant.findById(variantId).lean();

    const secondPayload = succeededPayload("evt_s4b", order);
    const res = await postWebhook(secondPayload, sign(secondPayload));
    expect(res.status).toBe(200);

    const variantAfterSecond = await Variant.findById(variantId).lean();
    expect(variantAfterSecond?.onHand).toBe(variantAfterFirst?.onHand);
    expect(variantAfterSecond?.reserved).toBe(variantAfterFirst?.reserved);
  });
});

describe("Stripe webhook · payment_intent.payment_failed / .canceled", () => {
  it("payment_failed: la orden sigue pending_payment, payment.status failed, reserved intacto", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId, qty } = await seedOrder(adminCookie, "F1", 2, 10);
    const payload = JSON.stringify({
      id: "evt_f1",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: order.payment.intentId,
          metadata: { orderId: String(order._id) },
          last_payment_error: { message: "Tarjeta rechazada" },
        },
      },
    });

    const res = await postWebhook(payload, sign(payload));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(updated?.payment.status).toBe(PaymentStatus.FAILED);
    // El motivo de Stripe debe llegar hasta la orden: es lo que el panel muestra
    // y lo que lleva el aviso de Telegram. Sin esto el admin ve "falló" y nada más.
    expect(updated?.payment.lastError).toBe("Tarjeta rechazada");

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(qty);
  });

  it("canceled: la orden queda cancelled y la reserva se libera", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "F2", 2, 10);
    const payload = JSON.stringify({
      id: "evt_f2",
      type: "payment_intent.canceled",
      data: { object: { id: order.payment.intentId, metadata: { orderId: String(order._id) } } },
    });

    const res = await postWebhook(payload, sign(payload));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.CANCELLED);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
    expect(variant?.onHand).toBe(10);
  });
});

describe("Stripe webhook · charge.refunded", () => {
  it("sobre orden paid: repone stock", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "R1", 2, 10);
    await postWebhook(succeededPayload("evt_r1a", order), sign(succeededPayload("evt_r1a", order)));

    const payload = JSON.stringify({
      id: "evt_r1b",
      type: "charge.refunded",
      data: { object: { id: "ch_1", payment_intent: order.payment.intentId } },
    });
    const res = await postWebhook(payload, sign(payload));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.REFUNDED);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(10); // fully restored
  });

  it("sobre orden shipped: NO repone stock", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "R2", 2, 10);
    await postWebhook(succeededPayload("evt_r2a", order), sign(succeededPayload("evt_r2a", order)));

    // Admin fulfillment moves the order past `paid` before the refund arrives.
    const doc = await Order.findById(order._id);
    doc!.status = OrderStatus.PROCESSING;
    doc!.statusHistory.push({ status: OrderStatus.PROCESSING, at: new Date() });
    await doc!.save();
    doc!.status = OrderStatus.SHIPPED;
    doc!.statusHistory.push({ status: OrderStatus.SHIPPED, at: new Date() });
    await doc!.save();

    const onHandBeforeRefund = (await Variant.findById(variantId).lean())?.onHand;

    const payload = JSON.stringify({
      id: "evt_r2b",
      type: "charge.refunded",
      data: { object: { id: "ch_2", payment_intent: order.payment.intentId } },
    });
    const res = await postWebhook(payload, sign(payload));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.REFUNDED);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(onHandBeforeRefund);
  });
});

describe("Stripe webhook · disputas", () => {
  it("charge.dispute.created deja la orden en disputed", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "D1", 1, 10);
    await postWebhook(succeededPayload("evt_d1a", order), sign(succeededPayload("evt_d1a", order)));

    const payload = JSON.stringify({
      id: "evt_d1b",
      type: "charge.dispute.created",
      data: { object: { id: "dp_1", payment_intent: order.payment.intentId } },
    });
    const res = await postWebhook(payload, sign(payload));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.DISPUTED);
  });

  it("charge.dispute.closed ganada regresa la orden a paid", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "D2", 1, 10);
    await postWebhook(succeededPayload("evt_d2a", order), sign(succeededPayload("evt_d2a", order)));
    const openPayload = JSON.stringify({
      id: "evt_d2b",
      type: "charge.dispute.created",
      data: { object: { id: "dp_2", payment_intent: order.payment.intentId } },
    });
    await postWebhook(openPayload, sign(openPayload));

    const closePayload = JSON.stringify({
      id: "evt_d2c",
      type: "charge.dispute.closed",
      data: { object: { id: "dp_2", status: "won", payment_intent: order.payment.intentId } },
    });
    const res = await postWebhook(closePayload, sign(closePayload));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PAID);
  });
});

describe("Stripe webhook · eventos ignorados o sin orden resoluble", () => {
  it("un tipo de evento desconocido responde 200 sin efectos", async () => {
    const payload = JSON.stringify({
      id: "evt_unknown",
      type: "customer.created",
      data: { object: { id: "cus_2" } },
    });
    const res = await postWebhook(payload, sign(payload));
    expect(res.status).toBe(200);
    const stored = await WebhookEvent.findOne({ eventId: "evt_unknown" }).lean();
    expect(stored?.status).toBe("ignored");
  });

  it("un evento cuyo orderId no existe responde 200 sin lanzar", async () => {
    const payload = JSON.stringify({
      id: "evt_noorder",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_ghost", metadata: {} } },
    });
    const res = await postWebhook(payload, sign(payload));
    expect(res.status).toBe(200);
  });
});
