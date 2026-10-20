import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import {
  Currency,
  DisputeStatus,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
} from "@gira/shared";
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
const { createOrderWithQuote: createOrder } = await import("../helpers/orders.js");
const { Order } = await import("../../src/models/Order.js");
const { Variant } = await import("../../src/models/Variant.js");
const { WebhookEvent } = await import("../../src/models/WebhookEvent.js");
const { StockReservation } = await import("../../src/models/StockReservation.js");
const { Notification } = await import("../../src/models/Notification.js");
const { applyOrderTransition } = await import("../../src/services/orderTransitionService.js");
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
  district: "Juárez",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "01000",
  country: "MX",
};
const validCustomer = { email: "cliente@example.com", name: "Ana Pérez", phone: "5512345678" };
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 10000, weightGrams: 400 });
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

let eventCounter = 0;
const nextEventId = (prefix: string): string => `evt_${prefix}_${(eventCounter += 1)}`;
const send = (payload: string) => postWebhook(payload, sign(payload));

/** A real order taken to `paid` through the webhook (reservation committed, stock decremented). */
const seedPaidOrder = async (suffix: string, qty = 2, onHand = 10) => {
  const adminCookie = await loginAsAdmin(app);
  const seeded = await seedOrder(adminCookie, suffix, qty, onHand);
  const id = nextEventId("paid");
  await send(succeededPayload(id, seeded.order));
  return { ...seeded, order: (await Order.findById(seeded.order._id))! };
};

const refundPayload = (
  order: { total: number; payment: { intentId?: string } },
  amountRefunded?: number,
): string =>
  JSON.stringify({
    id: nextEventId("ref"),
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_1",
        payment_intent: order.payment.intentId,
        amount: order.total,
        ...(amountRefunded !== undefined ? { amount_refunded: amountRefunded } : {}),
      },
    },
  });

const disputePayload = (
  type: "charge.dispute.created" | "charge.dispute.closed",
  order: { payment: { intentId?: string } },
  status?: string,
): string =>
  JSON.stringify({
    id: nextEventId("dp"),
    type,
    data: {
      object: { id: "dp_1", payment_intent: order.payment.intentId, ...(status ? { status } : {}) },
    },
  });

const move = (orderId: unknown, from: OrderStatus, to: OrderStatus) =>
  applyOrderTransition({
    orderId: orderId as never,
    from,
    to,
    actor: { type: "system" },
  });

const onHandOf = async (variantId: string) => (await Variant.findById(variantId).lean())?.onHand;

describe("Stripe webhook · charge.refunded", () => {
  it("reembolso TOTAL de una orden paid: queda refunded y repone el stock descontado", async () => {
    const { order, variantId } = await seedPaidOrder("R1", 2, 10);
    expect(await onHandOf(variantId)).toBe(8);

    const res = await send(refundPayload(order, order.total));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.REFUNDED);
    expect(updated?.payment.status).toBe(PaymentStatus.REFUNDED);
    expect(updated?.payment.refundedAmount).toBe(order.total);
    expect(await onHandOf(variantId)).toBe(10);
  });

  it("reembolso PARCIAL: guarda el monto, no cambia el estado ni repone stock", async () => {
    const { order, variantId } = await seedPaidOrder("R2", 2, 10);

    const res = await send(refundPayload(order, Math.floor(order.total / 4)));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PAID);
    expect(updated?.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(updated?.payment.refundedAmount).toBe(Math.floor(order.total / 4));
    expect(await onHandOf(variantId)).toBe(8);
  });

  it("parcial y luego total: repone una sola vez, y reentregar el total no repone de nuevo", async () => {
    const { order, variantId } = await seedPaidOrder("R3", 2, 10);

    await send(refundPayload(order, Math.floor(order.total / 2)));
    await send(refundPayload(order, order.total));
    expect(await onHandOf(variantId)).toBe(10);

    // A different event id for the same cumulative amount (Stripe re-sending it).
    await send(refundPayload(order, order.total));
    expect(await onHandOf(variantId)).toBe(10);

    // An out-of-order, smaller cumulative amount never rewinds the record.
    await send(refundPayload(order, Math.floor(order.total / 2)));
    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.REFUNDED);
    expect(updated?.payment.refundedAmount).toBe(order.total);
  });

  it("total sobre una orden que ya salió del taller (shipped): NO repone stock", async () => {
    const { order, variantId } = await seedPaidOrder("R4", 2, 10);
    await move(order._id, OrderStatus.PAID, OrderStatus.PROCESSING);
    await move(order._id, OrderStatus.PROCESSING, OrderStatus.SHIPPED);

    await send(refundPayload(order, order.total));

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.REFUNDED);
    expect(updated?.fulfillmentStartedAt).toBeInstanceOf(Date);
    expect(await onHandOf(variantId)).toBe(8);
  });

  it("total con la reserva ya liberada (stock nunca descontado): NO repone y avisa al equipo", async () => {
    const { order, variantId } = await seedPaidOrder("R5", 2, 10);
    // Simulate a paid order whose hold had been released before the commit: units
    // are back on sale, the order never recorded a commit.
    await Order.updateOne({ _id: order._id }, { $unset: { stockCommittedAt: 1 } });
    await StockReservation.updateOne(
      { order: order._id },
      { $set: { status: ReservationStatus.RELEASED } },
    );
    const onHandBefore = await onHandOf(variantId);

    await send(refundPayload(order, order.total));

    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.REFUNDED);
    expect(await onHandOf(variantId)).toBe(onHandBefore);
    expect(
      await Notification.countDocuments({
        type: NotificationType.TEAM_PAYMENT_NEEDS_REVIEW,
        "payload.reason": "refund_without_committed_stock",
        "payload.orderNumber": order.orderNumber,
      }),
    ).toBe(1);
  });

  it("total con la reserva todavía ACTIVE (commit pendiente): libera el apartado y no repone", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "R6", 2, 10);
    // paid in the books, but commitReservation never ran (it threw / is pending retry)
    await move(order._id, OrderStatus.PENDING_PAYMENT, OrderStatus.PAID);

    await send(refundPayload(order, order.total));

    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.REFUNDED);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
    expect(variant?.onHand).toBe(10);
    expect((await StockReservation.findOne({ order: order._id }).lean())?.status).toBe(
      ReservationStatus.RELEASED,
    );
  });

  it("total con la reserva ya purgada pero stockCommittedAt presente: repone con las líneas de la orden", async () => {
    const { order, variantId } = await seedPaidOrder("R7", 2, 10);
    await StockReservation.deleteOne({ order: order._id }); // what the 30-day TTL does

    await send(refundPayload(order, order.total));

    expect(await onHandOf(variantId)).toBe(10);
  });

  it("total sobre una orden expirada (pago tardío devuelto): solo marca el pago, la orden sigue expired", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "R8", 2, 10);
    await move(order._id, OrderStatus.PENDING_PAYMENT, OrderStatus.EXPIRED);
    await Order.updateOne({ _id: order._id }, { $set: { "payment.status": PaymentStatus.SUCCEEDED } });

    const res = await send(refundPayload(order, order.total));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.EXPIRED);
    expect(updated?.payment.status).toBe(PaymentStatus.REFUNDED);
    expect(updated?.payment.refundedAmount).toBe(order.total);
    expect((await Variant.findById(variantId).lean())?.onHand).toBe(10);
  });

  it("reembolso total que llega ANTES que el pago (orden aún pending_payment): falla para reintentarse, no se pierde", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "R10", 2, 10);
    const refund = refundPayload(order, order.total);

    const early = await send(refund);
    expect(early.status).toBeGreaterThanOrEqual(500);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.PENDING_PAYMENT);

    // The payment event catches up, then Stripe redelivers the SAME refund event.
    await send(succeededPayload(nextEventId("late"), order));
    const retry = await send(refund);
    expect(retry.status).toBe(200);

    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.REFUNDED);
    expect(await onHandOf(variantId)).toBe(10);
  });

  it("un charge.refunded sin amount_refunded es terminal (ignored), no reembolsa nada", async () => {
    const { order } = await seedPaidOrder("R9", 2, 10);

    const payload = refundPayload(order);
    const res = await send(payload);
    expect(res.status).toBe(200);

    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.PAID);
    const event = await WebhookEvent.findOne({ eventId: JSON.parse(payload).id }).lean();
    expect(event?.status).toBe("ignored");
  });
});

describe("Stripe webhook · disputas (campos de la orden, no un estado)", () => {
  const lostAlerts = (orderId: unknown) =>
    Notification.countDocuments({ order: orderId, type: NotificationType.TEAM_DISPUTE_LOST });

  it("charge.dispute.created marca disputeStatus open sin tocar el estado de la orden", async () => {
    const { order } = await seedPaidOrder("D1", 1, 10);

    const res = await send(disputePayload("charge.dispute.created", order));
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PAID);
    expect(updated?.disputeStatus).toBe(DisputeStatus.OPEN);
    expect(updated?.disputedAt).toBeInstanceOf(Date);
  });

  it("disputa ganada: won, la orden no se mueve y no hay alerta", async () => {
    const { order } = await seedPaidOrder("D2", 1, 10);
    await send(disputePayload("charge.dispute.created", order));

    await send(disputePayload("charge.dispute.closed", order, "won"));

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PAID);
    expect(updated?.disputeStatus).toBe(DisputeStatus.WON);
    expect(await lostAlerts(order._id)).toBe(0);
  });

  it("disputa PERDIDA no es un reembolso: ni estado, ni pago, ni stock; solo alerta TEAM (una vez)", async () => {
    const { order, variantId } = await seedPaidOrder("D3", 2, 10);
    await send(disputePayload("charge.dispute.created", order));

    await send(disputePayload("charge.dispute.closed", order, "lost"));
    // Same outcome re-sent under a new event id must not alert twice.
    await send(disputePayload("charge.dispute.closed", order, "lost"));

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PAID);
    expect(updated?.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(updated?.payment.refundedAmount).toBeUndefined();
    expect(updated?.disputeStatus).toBe(DisputeStatus.LOST);
    expect(await onHandOf(variantId)).toBe(8);
    expect(await lostAlerts(order._id)).toBe(1);
  });

  it("warning_closed es withdrawn, no una pérdida", async () => {
    const { order } = await seedPaidOrder("D4", 1, 10);
    await send(disputePayload("charge.dispute.created", order));

    await send(disputePayload("charge.dispute.closed", order, "warning_closed"));

    const updated = await Order.findById(order._id).lean();
    expect(updated?.disputeStatus).toBe(DisputeStatus.WITHDRAWN);
    expect(await lostAlerts(order._id)).toBe(0);
  });

  it("una disputa sobre una orden ya reembolsada se registra y no cambia el estado", async () => {
    const { order } = await seedPaidOrder("D5", 1, 10);
    await send(refundPayload(order, order.total));

    await send(disputePayload("charge.dispute.created", order));

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.REFUNDED);
    expect(updated?.disputeStatus).toBe(DisputeStatus.OPEN);
  });

  it("closed llegando ANTES que created se registra igual, y un created tardío no lo reabre", async () => {
    const { order } = await seedPaidOrder("D6", 1, 10);

    await send(disputePayload("charge.dispute.closed", order, "lost"));
    await send(disputePayload("charge.dispute.created", order));

    const updated = await Order.findById(order._id).lean();
    expect(updated?.disputeStatus).toBe(DisputeStatus.LOST);
    expect(updated?.disputedAt).toBeInstanceOf(Date);
    expect(await lostAlerts(order._id)).toBe(1);
  });

  it("un status de disputa desconocido no se interpreta: se ignora", async () => {
    const { order } = await seedPaidOrder("D7", 1, 10);

    const res = await send(disputePayload("charge.dispute.closed", order, "needs_response"));
    expect(res.status).toBe(200);

    expect((await Order.findById(order._id).lean())?.disputeStatus).toBeUndefined();
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

describe("Stripe webhook · detalle del cargo (M9a)", () => {
  it("guarda capturedAt y la tarjeta (brand + last4) al confirmarse el pago", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "CHG1");
    mockRetrieve.mockResolvedValueOnce({
      id: order.payment.intentId,
      status: "succeeded",
      latest_charge: {
        created: 1_760_000_000,
        payment_method_details: { type: "card", card: { brand: "visa", last4: "4242" } },
      },
    });

    const res = await send(succeededPayload(nextEventId("chg"), order));
    expect(res.status).toBe(200);

    const paid = await Order.findById(order._id).lean();
    expect(paid?.status).toBe(OrderStatus.PAID);
    expect(paid?.payment.capturedAt).toEqual(new Date(1_760_000_000 * 1000));
    expect(paid?.payment.card).toEqual({ brand: "visa", last4: "4242" });
  });

  it("si la consulta del cargo falla, la orden igual queda pagada (capturedAt = ahora, sin tarjeta)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "CHG2");
    mockRetrieve.mockRejectedValueOnce(new Error("stripe down"));
    const before = Date.now();

    const res = await send(succeededPayload(nextEventId("chg"), order));
    expect(res.status).toBe(200);

    const paid = await Order.findById(order._id).lean();
    expect(paid?.status).toBe(OrderStatus.PAID);
    expect(paid?.payment.card).toBeUndefined();
    expect(paid?.payment.capturedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});
